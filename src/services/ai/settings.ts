import { migrateLegacyApiKey, syncApiKeyStorage } from './keys';
import {
  DEFAULT_AI_CACHE_SETTINGS,
  DEFAULT_AI_GUARDRAILS,
  DEFAULT_AI_SETTINGS,
  isAiProviderId,
  type AiCacheSettings,
  type AiGuardrails,
  type AiSettings,
} from './types';

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
  };
}

function defaultSettings(): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    guardrails: { ...DEFAULT_AI_GUARDRAILS },
    cache: { ...DEFAULT_AI_CACHE_SETTINGS },
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
