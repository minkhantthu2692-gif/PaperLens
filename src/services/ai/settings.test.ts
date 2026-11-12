import { beforeEach, describe, expect, it } from 'vitest';
import { addApiKey, getActiveApiKey } from './keys';
import { loadAiSettings, saveAiSettings } from './settings';
import {
  DEFAULT_AI_ASSISTANT_PREFERENCES,
  DEFAULT_AI_CACHE_SETTINGS,
  DEFAULT_AI_SETTINGS,
} from './types';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('AI settings storage', () => {
  it('returns defaults when nothing is stored or the data is invalid', () => {
    expect(loadAiSettings()).toMatchObject({ providerId: 'openai', model: '' });
    localStorage.setItem('paperlens.ai.settings', '{not-json');
    expect(loadAiSettings().guardrails.maxInputChars).toBe(
      DEFAULT_AI_SETTINGS.guardrails.maxInputChars,
    );
  });

  it('disables caching by default and clamps stored cache settings', () => {
    expect(loadAiSettings().cache).toEqual(DEFAULT_AI_CACHE_SETTINGS);

    localStorage.setItem(
      'paperlens.ai.settings',
      JSON.stringify({ cache: { enabled: true, expiryDays: 1000, maxEntries: 0 } }),
    );
    expect(loadAiSettings().cache).toEqual({ enabled: true, expiryDays: 90, maxEntries: 1 });
  });

  it('keeps keys in the session by default and persists them only when requested', () => {
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, model: 'test-model' });
    addApiKey({ providerId: 'openai', label: 'Personal', key: 'session-key' }, false);

    expect(getActiveApiKey('openai')?.key).toBe('session-key');
    expect(localStorage.getItem('paperlens.ai.keys')).toBeNull();
    expect(sessionStorage.getItem('paperlens.ai.keys.session')).toContain('session-key');

    saveAiSettings({ ...DEFAULT_AI_SETTINGS, model: 'test-model', rememberKey: true });
    expect(localStorage.getItem('paperlens.ai.keys')).toContain('session-key');

    saveAiSettings({ ...DEFAULT_AI_SETTINGS, model: 'test-model', rememberKey: false });
    expect(localStorage.getItem('paperlens.ai.keys')).toBeNull();
    expect(getActiveApiKey('openai')?.key).toBe('session-key');
  });

  it('loads default assistant preferences for settings saved before them', () => {
    expect(loadAiSettings().assistant).toEqual({
      ...DEFAULT_AI_ASSISTANT_PREFERENCES,
      favoriteActions: [...DEFAULT_AI_ASSISTANT_PREFERENCES.favoriteActions],
    });

    localStorage.setItem('paperlens.ai.settings', JSON.stringify({ model: 'test-model' }));
    expect(loadAiSettings().assistant).toEqual({
      ...DEFAULT_AI_ASSISTANT_PREFERENCES,
      favoriteActions: [...DEFAULT_AI_ASSISTANT_PREFERENCES.favoriteActions],
    });
  });

  it('normalizes invalid assistant preferences and preset data', () => {
    localStorage.setItem(
      'paperlens.ai.settings',
      JSON.stringify({
        assistant: {
          tone: 'shouting',
          outputLength: 'tiny',
          translationStyle: 'poetic',
          sourceLanguageMode: 'guess',
          translationTargetLanguage: '  ',
          favoriteActions: ['proofread', 'proofread', 7, 'rewrite'],
          presets: [
            { id: 'a', name: '  Short  ', instruction: '  Trim this.  ' },
            { id: '', name: 'Invalid', instruction: 'Missing id' },
            { id: 'b', name: '', instruction: 'Missing name' },
            'not-a-preset',
          ],
          historyEnabled: true,
        },
      }),
    );

    const preferences = loadAiSettings().assistant;
    expect(preferences.tone).toBe(DEFAULT_AI_ASSISTANT_PREFERENCES.tone);
    expect(preferences.outputLength).toBe(DEFAULT_AI_ASSISTANT_PREFERENCES.outputLength);
    expect(preferences.translationStyle).toBe(DEFAULT_AI_ASSISTANT_PREFERENCES.translationStyle);
    expect(preferences.sourceLanguageMode).toBe('auto');
    expect(preferences.translationTargetLanguage).toBe(
      DEFAULT_AI_ASSISTANT_PREFERENCES.translationTargetLanguage,
    );
    expect(preferences.favoriteActions).toEqual(['proofread', 'rewrite']);
    expect(preferences.presets).toEqual([{ id: 'a', name: 'Short', instruction: 'Trim this.' }]);
    expect(preferences.historyEnabled).toBe(true);
  });

  it('migrates the legacy single-key storage into the key vault', () => {
    localStorage.setItem('paperlens.ai.apiKey.remembered', 'remembered-key');

    const settings = loadAiSettings();

    expect(getActiveApiKey(settings.providerId)?.key).toBe('remembered-key');
    expect(localStorage.getItem('paperlens.ai.apiKey.remembered')).toBeNull();
    expect(sessionStorage.getItem('paperlens.ai.apiKey.session')).toBeNull();
  });
});
