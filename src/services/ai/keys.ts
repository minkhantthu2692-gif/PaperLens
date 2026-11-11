import { createId } from '@/lib/id';
import { isAiProviderId, type AiProviderId } from './types';

const KEYS_STORAGE_KEY = 'paperlens.ai.keys';
const SESSION_KEYS_STORAGE_KEY = 'paperlens.ai.keys.session';
const LEGACY_SESSION_KEY_STORAGE_KEY = 'paperlens.ai.apiKey.session';
const LEGACY_REMEMBERED_KEY_STORAGE_KEY = 'paperlens.ai.apiKey.remembered';

export interface AiApiKeyEntry {
  id: string;
  providerId: AiProviderId;
  label: string;
  key: string;
  createdAt: number;
}

interface KeyVaultState {
  entries: AiApiKeyEntry[];
  activeByProvider: Record<string, string>;
}

function emptyVault(): KeyVaultState {
  return { entries: [], activeByProvider: {} };
}

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
    // Keep working for this session when persistence is unavailable.
  }
}

function removeStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing else to do when storage is unavailable.
  }
}

function isKeyEntry(value: unknown): value is AiApiKeyEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    record['id'].length > 0 &&
    typeof record['providerId'] === 'string' &&
    isAiProviderId(record['providerId']) &&
    typeof record['label'] === 'string' &&
    typeof record['key'] === 'string' &&
    record['key'].length > 0 &&
    typeof record['createdAt'] === 'number'
  );
}

function parseVault(raw: string | null): KeyVaultState {
  if (!raw) {
    return emptyVault();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return emptyVault();
    }
    const record = parsed as Record<string, unknown>;
    const entries = Array.isArray(record['entries']) ? record['entries'].filter(isKeyEntry) : [];
    const activeByProvider: Record<string, string> = {};
    const activeValue = record['activeByProvider'];
    if (typeof activeValue === 'object' && activeValue !== null) {
      for (const [providerId, keyId] of Object.entries(activeValue)) {
        if (isAiProviderId(providerId) && typeof keyId === 'string' && keyId.length > 0) {
          activeByProvider[providerId] = keyId;
        }
      }
    }
    return { entries, activeByProvider };
  } catch {
    return emptyVault();
  }
}

function mergeVaults(base: KeyVaultState, override: KeyVaultState): KeyVaultState {
  const entries = new Map<string, AiApiKeyEntry>();
  for (const entry of base.entries) {
    entries.set(entry.id, entry);
  }
  for (const entry of override.entries) {
    entries.set(entry.id, entry);
  }
  return {
    entries: Array.from(entries.values()),
    activeByProvider: { ...base.activeByProvider, ...override.activeByProvider },
  };
}

function readMergedVault(): KeyVaultState {
  const remembered = parseVault(readStorage(localStorage, KEYS_STORAGE_KEY));
  const session = parseVault(readStorage(sessionStorage, SESSION_KEYS_STORAGE_KEY));
  return mergeVaults(remembered, session);
}

function writeVault(state: KeyVaultState, remember: boolean): void {
  const raw = JSON.stringify(state);
  writeStorage(sessionStorage, SESSION_KEYS_STORAGE_KEY, raw);
  if (remember) {
    writeStorage(localStorage, KEYS_STORAGE_KEY, raw);
  } else {
    removeStorage(localStorage, KEYS_STORAGE_KEY);
  }
}

export function syncApiKeyStorage(remember: boolean): void {
  writeVault(readMergedVault(), remember);
}

export function migrateLegacyApiKey(providerId: AiProviderId): void {
  const remembered = readStorage(localStorage, LEGACY_REMEMBERED_KEY_STORAGE_KEY);
  const session = readStorage(sessionStorage, LEGACY_SESSION_KEY_STORAGE_KEY);
  const legacyKey = remembered?.trim() || session?.trim() || '';
  if (!legacyKey) {
    return;
  }

  const state = readMergedVault();
  const alreadyStored = state.entries.some(
    (entry) => entry.providerId === providerId && entry.key === legacyKey,
  );
  if (!alreadyStored) {
    const entry: AiApiKeyEntry = {
      id: createId(),
      providerId,
      label: 'Default',
      key: legacyKey,
      createdAt: Date.now(),
    };
    state.entries.push(entry);
    state.activeByProvider[providerId] ??= entry.id;
  }

  writeVault(state, !!remembered);
  removeStorage(localStorage, LEGACY_REMEMBERED_KEY_STORAGE_KEY);
  removeStorage(sessionStorage, LEGACY_SESSION_KEY_STORAGE_KEY);
}

export function listApiKeys(providerId: AiProviderId): AiApiKeyEntry[] {
  return readMergedVault()
    .entries.filter((entry) => entry.providerId === providerId)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function getActiveApiKey(providerId: AiProviderId): AiApiKeyEntry | null {
  const state = readMergedVault();
  const activeId = state.activeByProvider[providerId];
  const entries = state.entries.filter((entry) => entry.providerId === providerId);
  if (entries.length === 0) {
    return null;
  }
  return entries.find((entry) => entry.id === activeId) ?? entries[0] ?? null;
}

export function addApiKey(
  input: { providerId: AiProviderId; label: string; key: string },
  remember: boolean,
): AiApiKeyEntry | null {
  const key = input.key.trim();
  if (!key) {
    return null;
  }
  const state = readMergedVault();
  const entry: AiApiKeyEntry = {
    id: createId(),
    providerId: input.providerId,
    label: input.label.trim() || 'Key',
    key,
    createdAt: Date.now(),
  };
  state.entries.push(entry);
  state.activeByProvider[input.providerId] ??= entry.id;
  writeVault(state, remember);
  return entry;
}

export function removeApiKey(id: string, remember: boolean): void {
  const state = readMergedVault();
  const target = state.entries.find((entry) => entry.id === id);
  state.entries = state.entries.filter((entry) => entry.id !== id);

  if (target) {
    const activeId = state.activeByProvider[target.providerId];
    if (activeId === id) {
      const remaining = state.entries.find((entry) => entry.providerId === target.providerId);
      if (remaining) {
        state.activeByProvider[target.providerId] = remaining.id;
      } else {
        delete state.activeByProvider[target.providerId];
      }
    }
  }

  writeVault(state, remember);
}

export function setActiveApiKey(providerId: AiProviderId, id: string, remember: boolean): void {
  const state = readMergedVault();
  if (!state.entries.some((entry) => entry.id === id && entry.providerId === providerId)) {
    return;
  }
  state.activeByProvider[providerId] = id;
  writeVault(state, remember);
}

export function clearApiKeys(providerId: AiProviderId, remember: boolean): void {
  const state = readMergedVault();
  state.entries = state.entries.filter((entry) => entry.providerId !== providerId);
  delete state.activeByProvider[providerId];
  writeVault(state, remember);
}
