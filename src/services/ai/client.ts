import { buildAiCacheKey, readAiCache, writeAiCache } from './cache';
import { buildChatRequest, parseChatResponse, resolveProviderBaseUrl } from './providers';
import { buildAiPrompt } from './prompts';
import { recordAiUsage, getAiAllowance } from './usage';
import type { AiRequestOptions, AiResponse } from './types';

export type AiErrorCode =
  | 'missing-key'
  | 'missing-model'
  | 'missing-base-url'
  | 'offline'
  | 'empty-input'
  | 'input-too-large'
  | 'busy'
  | 'daily-limit'
  | 'monthly-limit'
  | 'auth'
  | 'quota'
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'server'
  | 'bad-request'
  | 'invalid-response'
  | 'cancelled'
  | 'unknown';

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;

  constructor(code: AiErrorCode, retryable = false) {
    super(code);
    this.name = 'AiError';
    this.code = code;
    this.retryable = retryable;
  }
}

let activeRequests = 0;

export function resetAiRuntimeState(): void {
  activeRequests = 0;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function mapHttpStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  if (status === 402) {
    return 'quota';
  }
  if (status === 429) {
    return 'rate-limit';
  }
  if (status >= 500) {
    return 'server';
  }
  if (status >= 400) {
    return 'bad-request';
  }
  return 'unknown';
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new AiError('cancelled'));
    };
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

interface FetchOnceInput {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  signal?: AbortSignal;
  providerId: AiRequestOptions['settings']['providerId'];
}

async function fetchOnce(input: FetchOnceInput): Promise<{
  text: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}> {
  const { url, init, timeoutMs, signal, providerId } = input;
  const controller = new AbortController();
  const handleExternalAbort = () => controller.abort();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  if (signal?.aborted) {
    window.clearTimeout(timer);
    throw new AiError('cancelled');
  }
  signal?.addEventListener('abort', handleExternalAbort, { once: true });

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new AiError(mapHttpStatus(response.status), isRetryableStatus(response.status));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiError('invalid-response');
    }

    const parsed = parseChatResponse(providerId, payload);
    if (!parsed.text.trim()) {
      throw new AiError('invalid-response');
    }
    return parsed;
  } catch (error) {
    if (error instanceof AiError) {
      throw error;
    }
    if (signal?.aborted) {
      throw new AiError('cancelled');
    }
    if (controller.signal.aborted) {
      throw new AiError('timeout', true);
    }
    throw new AiError('network', true);
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', handleExternalAbort);
  }
}

export async function requestAi(options: AiRequestOptions): Promise<AiResponse> {
  const { settings, apiKey, task, text, targetLanguage, signal } = options;
  const { guardrails } = settings;

  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new AiError('missing-key');
  }
  const model = settings.model.trim();
  if (!model) {
    throw new AiError('missing-model');
  }

  const baseUrl = resolveProviderBaseUrl(settings.providerId, settings.customBaseUrl);
  if (!baseUrl) {
    throw new AiError('missing-base-url');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AiError('offline');
  }

  const inputText = text.trim();
  if (!inputText) {
    throw new AiError('empty-input');
  }
  if (inputText.length > guardrails.maxInputChars) {
    throw new AiError('input-too-large');
  }

  const cacheKey = settings.cache.enabled
    ? buildAiCacheKey({
        settings,
        task,
        text: inputText,
        ...(targetLanguage ? { targetLanguage } : {}),
      })
    : null;

  if (cacheKey) {
    try {
      const cached = await readAiCache(cacheKey);
      if (cached) {
        return {
          text: cached.result,
          providerId: settings.providerId,
          model: cached.model,
          retries: 0,
          inputChars: cached.inputChars,
          outputChars: cached.outputChars,
          cached: true,
        };
      }
    } catch {
      // A cache failure must not block a live request.
    }
  }

  const allowance = getAiAllowance(guardrails);
  if (allowance.blocked) {
    throw new AiError(allowance.blocked);
  }

  if (activeRequests >= guardrails.maxConcurrent) {
    throw new AiError('busy');
  }

  const prompt = buildAiPrompt(task, inputText, targetLanguage);
  const request = buildChatRequest({
    providerId: settings.providerId,
    baseUrl,
    apiKey: trimmedKey,
    model,
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    maxOutputTokens: guardrails.maxOutputTokens,
  });

  activeRequests += 1;
  try {
    let retries = 0;
    for (;;) {
      try {
        const response = await fetchOnce({
          ...request,
          timeoutMs: guardrails.timeoutMs,
          ...(signal ? { signal } : {}),
          providerId: settings.providerId,
        });
        const resultText = response.text.trim();
        recordAiUsage(inputText.length, resultText.length);
        if (cacheKey) {
          const createdAt = Date.now();
          try {
            await writeAiCache(
              {
                key: cacheKey,
                createdAt,
                expiresAt: createdAt + settings.cache.expiryDays * 86_400_000,
                providerId: settings.providerId,
                model,
                task,
                result: resultText,
                inputChars: inputText.length,
                outputChars: resultText.length,
              },
              settings.cache,
            );
          } catch {
            // Caching is best-effort; the live result is still returned.
          }
        }
        return {
          text: resultText,
          providerId: settings.providerId,
          model,
          retries,
          inputChars: inputText.length,
          outputChars: resultText.length,
          cached: false,
        };
      } catch (error) {
        const aiError = error instanceof AiError ? error : new AiError('unknown');
        if (aiError.code === 'cancelled' || !aiError.retryable) {
          throw aiError;
        }
        if (retries >= guardrails.maxRetries) {
          throw aiError;
        }
        retries += 1;
        await delay(400 * 2 ** (retries - 1), signal);
      }
    }
  } finally {
    activeRequests -= 1;
  }
}
