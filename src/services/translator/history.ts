import { createId } from '@/lib/id';
import { getDatabase } from '@/services/storage/db';

const MAX_HISTORY_ENTRIES = 100;

export interface TranslationHistoryRecord {
  id: string;
  createdAt: number;
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export async function listTranslationHistory(): Promise<TranslationHistoryRecord[]> {
  const database = await getDatabase();
  const records = await database.getAllFromIndex('translationHistory', 'by-createdAt');
  return records.reverse();
}

export async function saveTranslationHistory(
  input: Omit<TranslationHistoryRecord, 'id' | 'createdAt'>,
): Promise<TranslationHistoryRecord> {
  const database = await getDatabase();
  const record: TranslationHistoryRecord = {
    ...input,
    id: createId(),
    createdAt: Date.now(),
  };
  const transaction = database.transaction('translationHistory', 'readwrite');
  const store = transaction.store;
  await store.put(record);
  const oldestFirst = await store.index('by-createdAt').getAllKeys();
  const excess = oldestFirst.length - MAX_HISTORY_ENTRIES;
  for (let index = 0; index < excess; index += 1) {
    const key = oldestFirst[index];
    if (key !== undefined) {
      await store.delete(key);
    }
  }
  await transaction.done;
  return record;
}

export async function deleteTranslationHistoryEntry(id: string): Promise<void> {
  const database = await getDatabase();
  await database.delete('translationHistory', id);
}
