import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocumentRecord, SourceAsset } from '@/domain/document';
import type { AiCacheRecord } from '@/services/ai/cache';

export const DATABASE_NAME = 'paperlens';
export const DATABASE_VERSION = 2;

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
