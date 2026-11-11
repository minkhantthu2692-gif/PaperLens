import { getDatabase } from '@/services/storage/db';
import { AI_PROMPT_VERSION } from './prompts';
import { resolveProviderBaseUrl } from './providers';
import type { AiCacheSettings, AiSettings, AiTaskId } from './types';

export const AI_CACHE_KEY_VERSION = 1;

export interface AiCacheRecord {
  key: string;
  createdAt: number;
  expiresAt: number;
  providerId: string;
  model: string;
  task: AiTaskId;
  result: string;
  inputChars: number;
  outputChars: number;
}

interface AiCacheKeyInput {
  settings: AiSettings;
  task: AiTaskId;
  text: string;
  targetLanguage?: string;
}

function normalizeCacheText(text: string): string {
  return text.trim().normalize('NFC').replace(/\r\n?/g, '\n');
}

export function buildAiCacheKey(input: AiCacheKeyInput): string {
  const { settings, task, text, targetLanguage } = input;
  return JSON.stringify({
    version: AI_CACHE_KEY_VERSION,
    promptVersion: AI_PROMPT_VERSION,
    provider: settings.providerId,
    baseUrl: resolveProviderBaseUrl(settings.providerId, settings.customBaseUrl),
    model: settings.model.trim(),
    maxOutputTokens: settings.guardrails.maxOutputTokens,
    task,
    targetLanguage: task === 'translate' ? (targetLanguage ?? '') : '',
    text: normalizeCacheText(text),
  });
}

export async function readAiCache(key: string): Promise<AiCacheRecord | undefined> {
  const database = await getDatabase();
  const record = await database.get('aiCache', key);
  if (!record) {
    return undefined;
  }
  if (record.expiresAt <= Date.now()) {
    await database.delete('aiCache', key);
    return undefined;
  }
  return record;
}

export async function writeAiCache(record: AiCacheRecord, config: AiCacheSettings): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction('aiCache', 'readwrite');
  const store = transaction.store;
  const now = Date.now();

  await store.put(record);

  const records = await store.getAll();
  for (const existing of records) {
    if (existing.expiresAt <= now) {
      await store.delete(existing.key);
    }
  }

  const keys = await store.index('by-createdAt').getAllKeys();
  const excess = keys.length - config.maxEntries;
  for (let index = 0; index < excess; index += 1) {
    const key = keys[index];
    if (key !== undefined) {
      await store.delete(key);
    }
  }

  await transaction.done;
}

export async function clearAiCache(): Promise<void> {
  const database = await getDatabase();
  await database.clear('aiCache');
}

export async function getAiCacheCount(): Promise<number> {
  const database = await getDatabase();
  return database.count('aiCache');
}
