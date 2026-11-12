import { migrateLegacyApiKey, syncApiKeyStorage } from './keys';
import {
  DEFAULT_AI_ASSISTANT_PREFERENCES,
  DEFAULT_AI_CACHE_SETTINGS,
  DEFAULT_AI_GUARDRAILS,
  DEFAULT_AI_SETTINGS,
  isAiOutputLength,
  isAiProviderId,
  isAiSourceLanguageMode,
  isAiTone,
  isAiTranslationStyle,
  type AiAssistantPreferences,
  type AiCacheSettings,
  type AiGuardrails,
  type AiPreset,
  type AiSettings,
} from './types';

const MAX_PRESETS = 12;
const MAX_PRESET_NAME = 60;
const MAX_PRESET_INSTRUCTION = 500;

const SETTINGS_STORAGE_KEY = 'paperlens.ai.settings';

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // The value applies for this session even when persistence is unavailable.
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeGuardrails(value: unknown): AiGuardrails {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    maxInputChars: clampNumber(
      record['maxInputChars'],
      500,
      50000,
      DEFAULT_AI_GUARDRAILS.maxInputChars,
    ),
    maxOutputTokens: clampNumber(
      record['maxOutputTokens'],
      64,
      8192,
      DEFAULT_AI_GUARDRAILS.maxOutputTokens,
    ),
    timeoutMs: clampNumber(record['timeoutMs'], 5000, 120000, DEFAULT_AI_GUARDRAILS.timeoutMs),
    maxRetries: clampNumber(record['maxRetries'], 0, 4, DEFAULT_AI_GUARDRAILS.maxRetries),
    maxConcurrent: clampNumber(record['maxConcurrent'], 1, 4, DEFAULT_AI_GUARDRAILS.maxConcurrent),
    dailyRequestLimit: clampNumber(
      record['dailyRequestLimit'],
      0,
      10000,
      DEFAULT_AI_GUARDRAILS.dailyRequestLimit,
    ),
    monthlyRequestLimit: clampNumber(
      record['monthlyRequestLimit'],
      0,
      100000,
      DEFAULT_AI_GUARDRAILS.monthlyRequestLimit,
    ),
    warningThreshold: clampNumber(
      record['warningThreshold'],
      1,
      100,
      DEFAULT_AI_GUARDRAILS.warningThreshold,
    ),
  };
}

function normalizeCacheSettings(value: unknown): AiCacheSettings {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    enabled: record['enabled'] === true,
    expiryDays: clampNumber(record['expiryDays'], 1, 90, DEFAULT_AI_CACHE_SETTINGS.expiryDays),
    maxEntries: clampNumber(record['maxEntries'], 1, 500, DEFAULT_AI_CACHE_SETTINGS.maxEntries),
  };
}

function normalizePreset(value: unknown): AiPreset | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = record['id'];
  const name = record['name'];
  const instruction = record['instruction'];
  if (
    typeof id !== 'string' ||
    !id ||
    typeof name !== 'string' ||
    typeof instruction !== 'string'
  ) {
    return null;
  }
  const trimmedName = name.trim().slice(0, MAX_PRESET_NAME);
  const trimmedInstruction = instruction.trim().slice(0, MAX_PRESET_INSTRUCTION);
  if (!trimmedName || !trimmedInstruction) {
    return null;
  }
  return { id, name: trimmedName, instruction: trimmedInstruction };
}

function normalizeAssistantPreferences(value: unknown): AiAssistantPreferences {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const defaults = DEFAULT_AI_ASSISTANT_PREFERENCES;
  const presets = Array.isArray(record['presets'])
    ? record['presets']
        .map(normalizePreset)
        .filter((preset): preset is AiPreset => preset !== null)
        .slice(0, MAX_PRESETS)
    : [];
  const favorites = Array.isArray(record['favoriteActions'])
    ? [
        ...new Set(
          record['favoriteActions'].filter(
            (entry): entry is string => typeof entry === 'string' && entry.length > 0,
          ),
        ),
      ].slice(0, 12)
    : [...defaults.favoriteActions];

  return {
    translationTargetLanguage:
      typeof record['translationTargetLanguage'] === 'string' &&
      record['translationTargetLanguage'].trim()
        ? record['translationTargetLanguage'].trim()
        : defaults.translationTargetLanguage,
    sourceLanguageMode: isAiSourceLanguageMode(record['sourceLanguageMode'])
      ? record['sourceLanguageMode']
      : defaults.sourceLanguageMode,
    sourceLanguage:
      typeof record['sourceLanguage'] === 'string' && record['sourceLanguage'].trim()
        ? record['sourceLanguage'].trim()
        : defaults.sourceLanguage,
    translationStyle: isAiTranslationStyle(record['translationStyle'])
      ? record['translationStyle']
      : defaults.translationStyle,
    tone: isAiTone(record['tone']) ? record['tone'] : defaults.tone,
    outputLength: isAiOutputLength(record['outputLength'])
      ? record['outputLength']
      : defaults.outputLength,
    preserveFormatting:
      typeof record['preserveFormatting'] === 'boolean'
        ? record['preserveFormatting']
        : defaults.preserveFormatting,
    contextAwareness:
      typeof record['contextAwareness'] === 'boolean'
        ? record['contextAwareness']
        : defaults.contextAwareness,
    favoriteActions: favorites,
    presets,
    historyEnabled: record['historyEnabled'] === true,
  };
}

function normalizeSettings(value: unknown): AiSettings {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const providerValue = record['providerId'];
  const providerId =
    typeof providerValue === 'string' && isAiProviderId(providerValue)
      ? providerValue
      : DEFAULT_AI_SETTINGS.providerId;
  const model = typeof record['model'] === 'string' ? record['model'] : '';
  const customBaseUrl = typeof record['customBaseUrl'] === 'string' ? record['customBaseUrl'] : '';
  const rememberKey = record['rememberKey'] === true;

  return {
    providerId,
    model,
    customBaseUrl,
    rememberKey,
    guardrails: normalizeGuardrails(record['guardrails']),
    cache: normalizeCacheSettings(record['cache']),
    assistant: normalizeAssistantPreferences(record['assistant']),
  };
}

function defaultSettings(): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    guardrails: { ...DEFAULT_AI_GUARDRAILS },
    cache: { ...DEFAULT_AI_CACHE_SETTINGS },
    assistant: {
      ...DEFAULT_AI_ASSISTANT_PREFERENCES,
      favoriteActions: [...DEFAULT_AI_ASSISTANT_PREFERENCES.favoriteActions],
      presets: [],
    },
  };
}

export function loadAiSettings(): AiSettings {
  let settings: AiSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    settings = raw ? normalizeSettings(JSON.parse(raw)) : defaultSettings();
  } catch {
    settings = defaultSettings();
  }
  migrateLegacyApiKey(settings.providerId);
  return settings;
}

export function saveAiSettings(settings: AiSettings): void {
  writeStorage(localStorage, SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  syncApiKeyStorage(settings.rememberKey);
}
