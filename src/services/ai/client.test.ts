import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CacheModule from './cache';
import { readAiCache, writeAiCache } from './cache';
import { AiError, requestAi, resetAiRuntimeState } from './client';
import { DEFAULT_AI_SETTINGS, type AiSettings } from './types';
import { recordAiUsage } from './usage';

vi.mock('./cache', async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>();
  return {
    ...actual,
    readAiCache: vi.fn(),
    writeAiCache: vi.fn(),
  };
});

function settingsWith(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    providerId: 'openai',
    model: 'test-model',
    guardrails: { ...DEFAULT_AI_SETTINGS.guardrails, ...overrides.guardrails },
    ...overrides,
  };
}

function jsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetAiRuntimeState();
  vi.mocked(readAiCache).mockResolvedValue(undefined);
  vi.mocked(writeAiCache).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('requestAi guardrails', () => {
  it('requires an API key and model before calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      requestAi({ settings: settingsWith(), apiKey: '', task: 'proofread', text: 'Hello' }),
    ).rejects.toMatchObject({ code: 'missing-key' });
    await expect(
      requestAi({
        settings: settingsWith({ model: '' }),
        apiKey: 'test-key',
        task: 'proofread',
        text: 'Hello',
      }),
    ).rejects.toMatchObject({ code: 'missing-model' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects input above the configured character limit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      requestAi({
        settings: settingsWith({
          guardrails: { ...DEFAULT_AI_SETTINGS.guardrails, maxInputChars: 5 },
        }),
        apiKey: 'test-key',
        task: 'proofread',
        text: 'This is too long',
      }),
    ).rejects.toMatchObject({ code: 'input-too-large' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the selected-text prompt and records usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'Clean result' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestAi({
      settings: settingsWith(),
      apiKey: 'test-key',
      task: 'translate',
      text: 'Selected text',
      targetLanguage: 'Burmese',
    });

    expect(result.text).toBe('Clean result');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
    };
    expect(body.max_tokens).toBe(DEFAULT_AI_SETTINGS.guardrails.maxOutputTokens);
    expect(body.messages[1]?.content).toBe('Selected text');
    expect(body.messages[0]?.content).toContain('Burmese');
  });

  it('retries transient rate limits once and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: 'OK' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestAi({
      settings: settingsWith(),
      apiKey: 'test-key',
      task: 'proofread',
      text: 'Text',
    });

    expect(result.text).toBe('OK');
    expect(result.retries).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry authentication failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      requestAi({
        settings: settingsWith(),
        apiKey: 'test-key',
        task: 'proofread',
        text: 'Text',
      }),
    ).rejects.toBeInstanceOf(AiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks requests after the daily limit is reached', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    recordAiUsage(10, 10);
    recordAiUsage(10, 10);

    await expect(
      requestAi({
        settings: settingsWith({
          guardrails: {
            ...DEFAULT_AI_SETTINGS.guardrails,
            dailyRequestLimit: 2,
            monthlyRequestLimit: 10,
          },
        }),
        apiKey: 'test-key',
        task: 'proofread',
        text: 'Text',
      }),
    ).rejects.toMatchObject({ code: 'daily-limit' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an exact cached result without contacting the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(readAiCache).mockResolvedValue({
      key: 'cached-key',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      providerId: 'openai',
      model: 'test-model',
      task: 'proofread',
      result: 'Cached result',
      inputChars: 4,
      outputChars: 13,
    });

    const result = await requestAi({
      settings: settingsWith({
        cache: { ...DEFAULT_AI_SETTINGS.cache, enabled: true },
      }),
      apiKey: 'test-key',
      task: 'proofread',
      text: 'Text',
    });

    expect(result).toMatchObject({ text: 'Cached result', cached: true, retries: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeAiCache).not.toHaveBeenCalled();
  });

  it('stores a successful result when caching is enabled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: ' Clean result ' } }] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestAi({
      settings: settingsWith({
        cache: { ...DEFAULT_AI_SETTINGS.cache, enabled: true, expiryDays: 3 },
      }),
      apiKey: 'test-key',
      task: 'proofread',
      text: 'Text',
    });

    expect(result).toMatchObject({ text: 'Clean result', cached: false });
    expect(writeAiCache).toHaveBeenCalledTimes(1);
    const [record, config] = vi.mocked(writeAiCache).mock.calls[0] ?? [];
    expect(record).toMatchObject({
      result: 'Clean result',
      providerId: 'openai',
      model: 'test-model',
      task: 'proofread',
      inputChars: 4,
      outputChars: 12,
    });
    expect(record?.expiresAt).toBe((record?.createdAt ?? 0) + 3 * 86_400_000);
    expect(config).toMatchObject({ enabled: true, expiryDays: 3 });
  });

  it('returns a cached result while offline', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.mocked(readAiCache).mockResolvedValue({
      key: 'cached-key',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      providerId: 'openai',
      model: 'test-model',
      task: 'proofread',
      result: 'Cached offline result',
      inputChars: 4,
      outputChars: 21,
    });

    const result = await requestAi({
      settings: settingsWith({
        cache: { ...DEFAULT_AI_SETTINGS.cache, enabled: true },
      }),
      apiKey: 'test-key',
      task: 'proofread',
      text: 'Text',
    });

    expect(result).toMatchObject({
      text: 'Cached offline result',
      cached: true,
      retries: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects requests with no cached result while offline', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    await expect(
      requestAi({
        settings: settingsWith({
          cache: { ...DEFAULT_AI_SETTINGS.cache, enabled: true },
        }),
        apiKey: 'test-key',
        task: 'proofread',
        text: 'Text',
      }),
    ).rejects.toMatchObject({ code: 'offline' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
