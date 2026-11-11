import {
  DEFAULT_AI_GUARDRAILS,
  DEFAULT_AI_SETTINGS,
  isAiProviderId,
  type AiGuardrails,
  type AiSettings,
} from './types';

const SETTINGS_STORAGE_KEY = 'paperlens.ai.settings';
const SESSION_KEY_STORAGE_KEY = 'paperlens.ai.apiKey.session';
const REMEMBERED_KEY_STORAGE_KEY = 'paperlens.ai.apiKey.remembered';

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // The value applies for this session even when persistence is unavailable.
  }
}

function removeStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing else to do when storage is unavailable.
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
  };
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_AI_SETTINGS, guardrails: { ...DEFAULT_AI_GUARDRAILS } };
    }
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AI_SETTINGS, guardrails: { ...DEFAULT_AI_GUARDRAILS } };
  }
}

export function loadAiApiKey(): string {
  const remembered = readStorage(localStorage, REMEMBERED_KEY_STORAGE_KEY);
  if (remembered) {
    return remembered;
  }
  return readStorage(sessionStorage, SESSION_KEY_STORAGE_KEY) ?? '';
}

export function saveAiSettings(settings: AiSettings, apiKey: string): void {
  writeStorage(localStorage, SETTINGS_STORAGE_KEY, JSON.stringify(settings));

  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    clearAiApiKey();
    return;
  }

  if (settings.rememberKey) {
    writeStorage(localStorage, REMEMBERED_KEY_STORAGE_KEY, trimmedKey);
    removeStorage(sessionStorage, SESSION_KEY_STORAGE_KEY);
  } else {
    writeStorage(sessionStorage, SESSION_KEY_STORAGE_KEY, trimmedKey);
    removeStorage(localStorage, REMEMBERED_KEY_STORAGE_KEY);
  }
}

export function clearAiApiKey(): void {
  removeStorage(sessionStorage, SESSION_KEY_STORAGE_KEY);
  removeStorage(localStorage, REMEMBERED_KEY_STORAGE_KEY);
}
