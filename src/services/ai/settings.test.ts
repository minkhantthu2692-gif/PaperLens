import { beforeEach, describe, expect, it } from 'vitest';
import { clearAiApiKey, loadAiApiKey, loadAiSettings, saveAiSettings } from './settings';
import { DEFAULT_AI_CACHE_SETTINGS, DEFAULT_AI_SETTINGS } from './types';

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

  it('keeps the API key in the session by default', () => {
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, model: 'test-model' }, 'session-key');

    expect(loadAiApiKey()).toBe('session-key');
    expect(localStorage.getItem('paperlens.ai.apiKey.remembered')).toBeNull();
    expect(sessionStorage.getItem('paperlens.ai.apiKey.session')).toBe('session-key');
  });

  it('stores the key persistently only when explicitly requested', () => {
    saveAiSettings(
      { ...DEFAULT_AI_SETTINGS, model: 'test-model', rememberKey: true },
      'remembered-key',
    );

    expect(loadAiApiKey()).toBe('remembered-key');
    expect(localStorage.getItem('paperlens.ai.apiKey.remembered')).toBe('remembered-key');
    expect(sessionStorage.getItem('paperlens.ai.apiKey.session')).toBeNull();
  });

  it('clears both stored key locations', () => {
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, rememberKey: true }, 'remembered-key');
    clearAiApiKey();

    expect(loadAiApiKey()).toBe('');
    expect(localStorage.getItem('paperlens.ai.apiKey.remembered')).toBeNull();
    expect(sessionStorage.getItem('paperlens.ai.apiKey.session')).toBeNull();
  });
});
