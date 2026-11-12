import { createId } from '@/lib/id';
import { getDatabase } from '@/services/storage/db';
import type { AiProviderId, AiTaskId } from './types';

export const MAX_AI_HISTORY_ENTRIES = 50;

/**
 * A locally stored AI result. History is opt-in and never leaves the device;
 * it is not part of document backups.
 */
export interface AiHistoryRecord {
  id: string;
  createdAt: number;
  actionId: string;
  task: AiTaskId;
  providerId: AiProviderId;
  model: string;
  sourceText: string;
  resultText: string;
  scopeLabel?: string;
}

export async function listAiHistory(): Promise<AiHistoryRecord[]> {
  const database = await getDatabase();
  const records = await database.getAllFromIndex('aiHistory', 'by-createdAt');
  return records.reverse();
}

export async function saveAiHistory(
  input: Omit<AiHistoryRecord, 'id' | 'createdAt'>,
): Promise<AiHistoryRecord> {
  const database = await getDatabase();
  const record: AiHistoryRecord = {
    ...input,
    id: createId(),
    createdAt: Date.now(),
  };
  const transaction = database.transaction('aiHistory', 'readwrite');
  const store = transaction.store;
  await store.put(record);
  const oldestFirst = await store.index('by-createdAt').getAllKeys();
  const excess = oldestFirst.length - MAX_AI_HISTORY_ENTRIES;
  for (let index = 0; index < excess; index += 1) {
    const key = oldestFirst[index];
    if (key !== undefined) {
      await store.delete(key);
    }
  }
  await transaction.done;
  return record;
}

export async function deleteAiHistoryEntry(id: string): Promise<void> {
  const database = await getDatabase();
  await database.delete('aiHistory', id);
}

export async function getAiHistoryCount(): Promise<number> {
  const database = await getDatabase();
  return database.count('aiHistory');
}

export async function clearAiHistory(): Promise<void> {
  const database = await getDatabase();
  await database.clear('aiHistory');
}
