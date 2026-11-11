import { describe, expect, it } from 'vitest';
import { buildAiCacheKey } from './cache';
import { DEFAULT_AI_SETTINGS, type AiSettings } from './types';

function settingsWith(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    model: 'test-model',
    ...overrides,
  };
}

const baseInput = {
  settings: settingsWith(),
  task: 'proofread' as const,
  text: 'Café\r\nSecond  line',
};

describe('buildAiCacheKey', () => {
  it('normalizes whitespace, line endings, and Unicode composition', () => {
    const equivalent = buildAiCacheKey({
      ...baseInput,
      text: '  Cafe\u0301\nSecond  line  ',
    });
    expect(equivalent).toBe(buildAiCacheKey(baseInput));
  });

  it('includes the provider, model, task, output limit, and target language', () => {
    const base = buildAiCacheKey(baseInput);
    expect(buildAiCacheKey({ ...baseInput, settings: settingsWith({ model: 'other' }) })).not.toBe(
      base,
    );
    expect(buildAiCacheKey({ ...baseInput, task: 'summarize' })).not.toBe(base);
    expect(
      buildAiCacheKey({
        ...baseInput,
        settings: settingsWith({
          guardrails: { ...DEFAULT_AI_SETTINGS.guardrails, maxOutputTokens: 2048 },
        }),
      }),
    ).not.toBe(base);
    expect(buildAiCacheKey({ ...baseInput, task: 'translate' })).not.toBe(
      buildAiCacheKey({ ...baseInput, task: 'translate', targetLanguage: 'Burmese' }),
    );
  });

  it('ignores the target language for non-translation tasks', () => {
    expect(buildAiCacheKey({ ...baseInput, task: 'proofread', targetLanguage: 'Burmese' })).toBe(
      buildAiCacheKey(baseInput),
    );
  });
});
