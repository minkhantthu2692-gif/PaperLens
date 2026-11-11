import type { AiProviderId } from './types';

export type AiProviderKind = 'openai-compatible' | 'anthropic' | 'gemini';

export interface AiProviderDefinition {
  id: AiProviderId;
  label: string;
  kind: AiProviderKind;
  baseUrl: string;
  requiresBaseUrl: boolean;
}

export const AI_PROVIDERS: readonly AiProviderDefinition[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresBaseUrl: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'xai',
    label: 'xAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'together',
    label: 'Together AI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    kind: 'openai-compatible',
    baseUrl: '',
    requiresBaseUrl: true,
  },
];

const PROVIDER_MAP = new Map(AI_PROVIDERS.map((provider) => [provider.id, provider]));

export function getProviderDefinition(id: AiProviderId): AiProviderDefinition {
  const provider = PROVIDER_MAP.get(id);
  if (!provider) {
    throw new Error(`Unknown AI provider: ${id}`);
  }
  return provider;
}

export function resolveProviderBaseUrl(providerId: AiProviderId, customBaseUrl: string): string {
  const provider = getProviderDefinition(providerId);
  const baseUrl = provider.requiresBaseUrl ? customBaseUrl : provider.baseUrl;
  return baseUrl.trim().replace(/\/+$/, '');
}

export interface ProviderHttpRequest {
  url: string;
  init: RequestInit;
}

interface ChatRequestInput {
  providerId: AiProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
}

function stripModelsPrefix(model: string): string {
  return model.trim().replace(/^models\//, '');
}

export function buildChatRequest(input: ChatRequestInput): ProviderHttpRequest {
  const { providerId, baseUrl, apiKey, model, systemPrompt, userPrompt, maxOutputTokens } = input;
  const provider = getProviderDefinition(providerId);

  if (provider.kind === 'anthropic') {
    return {
      url: `${baseUrl}/messages`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: model.trim(),
          max_tokens: maxOutputTokens,
          temperature: 0.2,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      },
    };
  }

  if (provider.kind === 'gemini') {
    const name = encodeURIComponent(stripModelsPrefix(model));
    return {
      url: `${baseUrl}/models/${name}:generateContent`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens,
            temperature: 0.2,
          },
        }),
      },
    };
  }

  return {
    url: `${baseUrl}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.trim(),
        max_tokens: maxOutputTokens,
        temperature: 0.2,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    },
  };
}

export interface ParsedChatResponse {
  text: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function collectTextParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return '';
  }
  return parts
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (isRecord(part)) {
        const text = part['text'];
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('');
}

export function parseChatResponse(providerId: AiProviderId, payload: unknown): ParsedChatResponse {
  const provider = getProviderDefinition(providerId);

  if (!isRecord(payload)) {
    throw new Error('Invalid provider response');
  }

  if (provider.kind === 'anthropic') {
    const content = payload['content'];
    if (!Array.isArray(content)) {
      throw new Error('Invalid Anthropic response');
    }
    const text = content
      .map((block) => {
        if (isRecord(block) && block['type'] === 'text') {
          const value = block['text'];
          return typeof value === 'string' ? value : '';
        }
        return '';
      })
      .join('');
    const usage = isRecord(payload['usage']) ? payload['usage'] : undefined;
    return {
      text,
      ...(usage ? { inputTokens: readNumber(usage, 'input_tokens') } : {}),
      ...(usage ? { outputTokens: readNumber(usage, 'output_tokens') } : {}),
    };
  }

  if (provider.kind === 'gemini') {
    const candidates = payload['candidates'];
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('Invalid Gemini response');
    }
    const candidate = candidates[0];
    const content = isRecord(candidate) ? candidate['content'] : undefined;
    const parts = isRecord(content) ? content['parts'] : undefined;
    const text = collectTextParts(parts);
    const usage = isRecord(payload['usageMetadata']) ? payload['usageMetadata'] : undefined;
    return {
      text,
      ...(usage ? { inputTokens: readNumber(usage, 'promptTokenCount') } : {}),
      ...(usage ? { outputTokens: readNumber(usage, 'candidatesTokenCount') } : {}),
    };
  }

  const choices = payload['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('Invalid chat completion response');
  }
  const choice = choices[0];
  const message = isRecord(choice) ? choice['message'] : undefined;
  const content = isRecord(message) ? message['content'] : undefined;

  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = collectTextParts(content);
  }

  const usage = isRecord(payload['usage']) ? payload['usage'] : undefined;
  return {
    text,
    ...(usage ? { inputTokens: readNumber(usage, 'prompt_tokens') } : {}),
    ...(usage ? { outputTokens: readNumber(usage, 'completion_tokens') } : {}),
  };
}

function parseModelIds(providerId: AiProviderId, payload: unknown): string[] {
  const provider = getProviderDefinition(providerId);
  if (!isRecord(payload)) {
    return [];
  }

  if (provider.kind === 'gemini') {
    const models = payload['models'];
    if (!Array.isArray(models)) {
      return [];
    }
    return models
      .map((model) => {
        if (!isRecord(model)) {
          return '';
        }
        const name = model['name'];
        const methods = model['supportedGenerationMethods'];
        const supportsGenerate = !Array.isArray(methods) || methods.includes('generateContent');
        return supportsGenerate && typeof name === 'string' ? stripModelsPrefix(name) : '';
      })
      .filter(Boolean);
  }

  const data = payload['data'];
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((model) => {
      if (!isRecord(model)) {
        return '';
      }
      const id = model['id'];
      return typeof id === 'string' ? id : '';
    })
    .filter(Boolean);
}

export async function fetchProviderModels(
  providerId: AiProviderId,
  apiKey: string,
  customBaseUrl: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const provider = getProviderDefinition(providerId);
  const baseUrl = resolveProviderBaseUrl(providerId, customBaseUrl);
  if (!baseUrl) {
    throw new Error('A base URL is required for this provider');
  }

  const headers: Record<string, string> = {};
  const url = `${baseUrl}/models`;

  if (provider.kind === 'gemini') {
    headers['x-goog-api-key'] = apiKey;
  } else if (provider.kind === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    headers,
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`Model discovery failed with status ${response.status}`);
  }
  const payload: unknown = await response.json();
  return Array.from(new Set(parseModelIds(providerId, payload))).sort((a, b) => a.localeCompare(b));
}
