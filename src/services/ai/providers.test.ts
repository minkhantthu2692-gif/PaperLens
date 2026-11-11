import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildChatRequest,
  fetchProviderModels,
  parseChatResponse,
  resolveProviderBaseUrl,
} from './providers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildChatRequest', () => {
  it('builds an OpenAI-compatible chat completion request', () => {
    const request = buildChatRequest({
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'System',
      userPrompt: 'User text',
      maxOutputTokens: 256,
    });

    expect(request.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request.init.method).toBe('POST');
    expect(request.init.headers).toMatchObject({ authorization: 'Bearer test-key' });
    expect(JSON.parse(String(request.init.body))).toMatchObject({
      model: 'test-model',
      max_tokens: 256,
      stream: false,
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User text' },
      ],
    });
  });

  it('builds an Anthropic message request with browser access headers', () => {
    const request = buildChatRequest({
      providerId: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'System',
      userPrompt: 'User text',
      maxOutputTokens: 128,
    });

    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.init.headers).toMatchObject({
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
  });

  it('builds a Gemini generateContent request without leaking the key in the body', () => {
    const request = buildChatRequest({
      providerId: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'test-key',
      model: 'models/test-model',
      systemPrompt: 'System',
      userPrompt: 'User text',
      maxOutputTokens: 128,
    });

    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
    );
    expect(request.init.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    expect(JSON.parse(String(request.init.body))).toMatchObject({
      systemInstruction: { parts: [{ text: 'System' }] },
      contents: [{ role: 'user', parts: [{ text: 'User text' }] }],
      generationConfig: { maxOutputTokens: 128 },
    });
  });
});

describe('parseChatResponse', () => {
  it('reads OpenAI-compatible content and usage', () => {
    expect(
      parseChatResponse('openai', {
        choices: [{ message: { content: ' Result ' } }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }),
    ).toEqual({ text: ' Result ', inputTokens: 12, outputTokens: 3 });
  });

  it('reads Anthropic text blocks', () => {
    expect(
      parseChatResponse('anthropic', {
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
        usage: { input_tokens: 4, output_tokens: 2 },
      }),
    ).toEqual({ text: 'Hello world', inputTokens: 4, outputTokens: 2 });
  });

  it('reads Gemini candidates', () => {
    expect(
      parseChatResponse('gemini', {
        candidates: [{ content: { parts: [{ text: 'Gemini result' }] } }],
        usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 2 },
      }),
    ).toEqual({ text: 'Gemini result', inputTokens: 6, outputTokens: 2 });
  });

  it('rejects malformed payloads', () => {
    expect(() => parseChatResponse('openai', {})).toThrow();
  });
});

describe('fetchProviderModels', () => {
  it('loads and de-duplicates OpenAI-compatible model IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderModels('openai', 'test-key', '')).resolves.toEqual([
      'model-a',
      'model-b',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer test-key' }),
      }),
    );
  });

  it('filters Gemini models without generateContent support', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: 'models/text-model', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embed-model', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderModels('gemini', 'test-key', '')).resolves.toEqual(['text-model']);
  });

  it('requires a base URL for custom endpoints', async () => {
    await expect(fetchProviderModels('custom', 'test-key', '')).rejects.toThrow();
  });
});

describe('resolveProviderBaseUrl', () => {
  it('trims trailing slashes and uses the custom URL when required', () => {
    expect(resolveProviderBaseUrl('openai', '')).toBe('https://api.openai.com/v1');
    expect(resolveProviderBaseUrl('custom', ' https://example.com/v1/ ')).toBe(
      'https://example.com/v1',
    );
  });
});
