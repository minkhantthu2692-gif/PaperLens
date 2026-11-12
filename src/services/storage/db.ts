import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocumentRecord, SourceAsset } from '@/domain/document';
import type { AiCacheRecord } from '@/services/ai/cache';
import type { AiHistoryRecord } from '@/services/ai/history';
import type { TranslationHistoryRecord } from '@/services/translator/history';

export const DATABASE_NAME = 'paperlens';
export const DATABASE_VERSION = 4;

interface PaperLensSchema extends DBSchema {
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: { 'by-updatedAt': number };
  };
  assets: {
    key: string;
    value: SourceAsset;
  };
  aiCache: {
    key: string;
    value: AiCacheRecord;
    indexes: { 'by-createdAt': number };
  };
  translationHistory: {
    key: string;
    value: TranslationHistoryRecord;
    indexes: { 'by-createdAt': number };
  };
  aiHistory: {
    key: string;
    value: AiHistoryRecord;
    indexes: { 'by-createdAt': number };
  };
}

let databasePromise: Promise<IDBPDatabase<PaperLensSchema>> | null = null;

export function getDatabase(): Promise<IDBPDatabase<PaperLensSchema>> {
  if (!databasePromise) {
    databasePromise = openDB<PaperLensSchema>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const documents = database.createObjectStore('documents', { keyPath: 'id' });
          documents.createIndex('by-updatedAt', 'updatedAt');
          database.createObjectStore('assets', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          const aiCache = database.createObjectStore('aiCache', { keyPath: 'key' });
          aiCache.createIndex('by-createdAt', 'createdAt');
        }
        if (oldVersion < 3) {
          const history = database.createObjectStore('translationHistory', { keyPath: 'id' });
          history.createIndex('by-createdAt', 'createdAt');
        }
        if (oldVersion < 4) {
          const aiHistory = database.createObjectStore('aiHistory', { keyPath: 'id' });
          aiHistory.createIndex('by-createdAt', 'createdAt');
        }
        // Add future migrations below with `if (oldVersion < N) { ... }`.
      },
      blocked() {
        databasePromise = null;
      },
      blocking() {
        databasePromise = null;
      },
      terminated() {
        databasePromise = null;
      },
    });
  }
  return databasePromise;
}

export function resetDatabaseConnection(): void {
  databasePromise = null;
}
