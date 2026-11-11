import { beforeEach, describe, expect, it } from 'vitest';
import {
  addApiKey,
  clearApiKeys,
  getActiveApiKey,
  listApiKeys,
  migrateLegacyApiKey,
  removeApiKey,
  setActiveApiKey,
  syncApiKeyStorage,
} from './keys';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('AI API key vault', () => {
  it('stores multiple keys for the same provider and uses the first as active', () => {
    const first = addApiKey({ providerId: 'openai', label: 'Personal', key: 'sk-one' }, false);
    const second = addApiKey({ providerId: 'openai', label: 'Work', key: 'sk-two' }, false);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(listApiKeys('openai').map((entry) => entry.label)).toEqual(['Personal', 'Work']);
    expect(getActiveApiKey('openai')?.key).toBe('sk-one');
  });

  it('switches the active key and removes it with a safe fallback', () => {
    const first = addApiKey({ providerId: 'openai', label: 'One', key: 'sk-one' }, false);
    const second = addApiKey({ providerId: 'openai', label: 'Two', key: 'sk-two' }, false);
    if (!first || !second) {
      throw new Error('keys were not created');
    }

    setActiveApiKey('openai', second.id, false);
    expect(getActiveApiKey('openai')?.key).toBe('sk-two');

    removeApiKey(second.id, false);
    expect(getActiveApiKey('openai')?.key).toBe('sk-one');
  });

  it('keeps keys isolated by provider', () => {
    addApiKey({ providerId: 'openai', label: 'OpenAI', key: 'sk-openai' }, false);
    addApiKey({ providerId: 'groq', label: 'Groq', key: 'gsk-groq' }, false);

    expect(listApiKeys('openai')).toHaveLength(1);
    expect(getActiveApiKey('groq')?.key).toBe('gsk-groq');

    clearApiKeys('openai', false);
    expect(listApiKeys('openai')).toHaveLength(0);
    expect(getActiveApiKey('groq')?.key).toBe('gsk-groq');
  });

  it('persists keys only when remembering is enabled', () => {
    addApiKey({ providerId: 'openai', label: 'Session', key: 'sk-session' }, false);
    expect(localStorage.getItem('paperlens.ai.keys')).toBeNull();
    expect(sessionStorage.getItem('paperlens.ai.keys.session')).toContain('sk-session');

    syncApiKeyStorage(true);
    expect(localStorage.getItem('paperlens.ai.keys')).toContain('sk-session');

    syncApiKeyStorage(false);
    expect(localStorage.getItem('paperlens.ai.keys')).toBeNull();
    expect(getActiveApiKey('openai')?.key).toBe('sk-session');
  });

  it('migrates a legacy single stored key without duplicating it', () => {
    localStorage.setItem('paperlens.ai.apiKey.remembered', 'legacy-key');

    migrateLegacyApiKey('openai');
    migrateLegacyApiKey('openai');

    expect(listApiKeys('openai')).toHaveLength(1);
    expect(getActiveApiKey('openai')?.key).toBe('legacy-key');
    expect(localStorage.getItem('paperlens.ai.apiKey.remembered')).toBeNull();
  });

  it('ignores malformed stored data and rejects empty keys', () => {
    localStorage.setItem('paperlens.ai.keys', '{not-json');
    expect(listApiKeys('openai')).toHaveLength(0);
    expect(addApiKey({ providerId: 'openai', label: 'Empty', key: '   ' }, false)).toBeNull();
  });
});
