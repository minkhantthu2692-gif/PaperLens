import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CacheModule from './cache';
import { readAiCache, writeAiCache } from './cache';
import { requestAi, resetAiRuntimeState } from './client';
import {
  mergeAiRefinementParams,
  parseAiImageReport,
  requestAiImageRefinement,
} from './imageRefinement';
import { providerSupportsImageInput } from './providers';
import { DEFAULT_AI_SETTINGS, type AiSettings } from './types';
import { DEFAULT_REFINEMENT_PARAMS } from '@/domain/refinement';

vi.mock('./cache', async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>();
  return {
    ...actual,
    readAiCache: vi.fn(),
    writeAiCache: vi.fn(),
  };
});

const IMAGE = { dataUrl: 'data:image/jpeg;base64,QUJD', mimeType: 'image/jpeg' };

function settingsWith(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    providerId: 'openai',
    model: 'vision-model',
    cache: { ...DEFAULT_AI_SETTINGS.cache, enabled: true },
    ...overrides,
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

const REPORT = {
  summary: 'The scan is slightly rotated and noisy.',
  issues: [
    { code: 'skew', severity: 'high', detail: 'Baselines slope down to the right.' },
    { code: 'noise', severity: 'medium' },
    { code: 'not-a-real-issue', severity: 'high' },
  ],
  recommendedPreset: 'document',
  recommendations: {
    deskew: true,
    denoise: 250,
    brightness: -300,
    binarize: 'adaptive',
    sharpen: 40,
    perspective: { topLeft: { x: 0, y: 0 } },
  },
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetAiRuntimeState();
  vi.mocked(readAiCache).mockResolvedValue(undefined);
  vi.mocked(writeAiCache).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI image report parsing', () => {
  it('accepts fenced JSON and drops unknown values', () => {
    const report = parseAiImageReport(`\`\`\`json\n${JSON.stringify(REPORT)}\n\`\`\``);
    expect(report.summary).toBe('The scan is slightly rotated and noisy.');
    expect(report.issues.map((issue) => issue.code)).toEqual(['skew', 'noise']);
    expect(report.issues[0]?.detail).toBe('Baselines slope down to the right.');
    expect(report.recommendedPreset).toBe('document');
    // Numbers are clamped and unsupported keys are ignored.
    expect(report.recommendations.denoise).toBe(100);
    expect(report.recommendations.brightness).toBe(-100);
    expect(report.recommendations.binarize).toBe('adaptive');
    expect(report.recommendations.sharpen).toBe(40);
    expect(report.recommendations.perspective).toBeUndefined();
  });

  it('recovers a JSON object embedded in extra prose', () => {
    const report = parseAiImageReport(`Here is the result: ${JSON.stringify(REPORT)} Done.`);
    expect(report.issues.length).toBe(2);
  });

  it('rejects a response without usable JSON', () => {
    expect(() => parseAiImageReport('I could not analyze the image.')).toThrowError();
  });

  it('merges AI recommendations over the local baseline and keeps the crop', () => {
    const report = parseAiImageReport(JSON.stringify(REPORT));
    const quad = {
      topLeft: { x: 0.1, y: 0.1 },
      topRight: { x: 0.9, y: 0.1 },
      bottomRight: { x: 0.9, y: 0.9 },
      bottomLeft: { x: 0.1, y: 0.9 },
    };
    const merged = mergeAiRefinementParams(
      { ...DEFAULT_REFINEMENT_PARAMS, perspective: quad },
      report,
    );
    expect(merged.deskew).toBe(true);
    expect(merged.denoise).toBe(100);
    expect(merged.perspective).toEqual(quad);
  });
});

describe('AI image requests', () => {
  it('reports provider image support', () => {
    expect(providerSupportsImageInput('openai')).toBe(true);
    expect(providerSupportsImageInput('gemini')).toBe(true);
    expect(providerSupportsImageInput('deepseek')).toBe(false);
  });

  it('sends an OpenAI-compatible image request and never caches it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: JSON.stringify(REPORT) } }] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const report = await requestAiImageRefinement({
      settings: settingsWith(),
      apiKey: 'test-key',
      image: IMAGE,
      mode: 'analysis',
    });

    expect(report.summary).toContain('rotated');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: expect.stringContaining('JSON') },
      { type: 'image_url', image_url: { url: IMAGE.dataUrl } },
    ]);
    expect(writeAiCache).not.toHaveBeenCalled();
  });

  it('sends Gemini inline image data and Anthropic base64 blocks', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(REPORT) }] } }] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await requestAiImageRefinement({
      settings: settingsWith({ providerId: 'gemini' }),
      apiKey: 'test-key',
      image: IMAGE,
      mode: 'enhancement',
    });
    const geminiBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(geminiBody.contents[0].parts[0]).toEqual({
      inline_data: { mime_type: 'image/jpeg', data: 'QUJD' },
    });

    fetchMock.mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: JSON.stringify(REPORT) }] }),
    );
    await requestAiImageRefinement({
      settings: settingsWith({ providerId: 'anthropic' }),
      apiKey: 'test-key',
      image: IMAGE,
      mode: 'enhancement',
    });
    const anthropicBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(anthropicBody.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' },
    });
  });

  it('refuses image payloads for providers without image support', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      requestAiImageRefinement({
        settings: settingsWith({ providerId: 'deepseek' }),
        apiKey: 'test-key',
        image: IMAGE,
        mode: 'analysis',
      }),
    ).rejects.toMatchObject({ code: 'bad-request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an image payload on a text-only task', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      requestAi({
        settings: settingsWith(),
        apiKey: 'test-key',
        task: 'proofread',
        text: 'Some text',
        image: IMAGE,
      }),
    ).rejects.toMatchObject({ code: 'bad-request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
