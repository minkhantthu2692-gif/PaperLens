import {
  DOCUMENT_SCHEMA_VERSION,
  EMPTY_EDITOR_CONTENT,
  type DocumentRecord,
  type EditorContent,
  type SourceAsset,
  type SourceKind,
} from '@/domain/document';
import { createId } from '@/lib/id';
import { getDatabase } from './db';

export interface CreateDocumentInput {
  file: File;
  kind: SourceKind;
  mimeType: string;
  title: string;
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const database = await getDatabase();
  const documents = await database.getAllFromIndex('documents', 'by-updatedAt');
  return documents.reverse();
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const database = await getDatabase();
  return database.get('documents', id);
}

export async function getSourceAsset(id: string): Promise<SourceAsset | undefined> {
  const database = await getDatabase();
  return database.get('assets', id);
}

export async function createDocumentFromFile(input: CreateDocumentInput): Promise<DocumentRecord> {
  const database = await getDatabase();
  const now = Date.now();
  const assetId = createId();
  const documentId = createId();

  const asset: SourceAsset = {
    id: assetId,
    blob: input.file,
    mimeType: input.mimeType,
    fileName: input.file.name,
    size: input.file.size,
    createdAt: now,
  };

  const document: DocumentRecord = {
    id: documentId,
    title: input.title,
    createdAt: now,
    updatedAt: now,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    source: {
      assetId,
      kind: input.kind,
      mimeType: input.mimeType,
      fileName: input.file.name,
      size: input.file.size,
    },
    editor: EMPTY_EDITOR_CONTENT,
  };

  const transaction = database.transaction(['documents', 'assets'], 'readwrite');
  await transaction.objectStore('assets').add(asset);
  await transaction.objectStore('documents').add(document);
  await transaction.done;

  return document;
}

export async function saveEditorContent(
  id: string,
  editor: EditorContent,
): Promise<DocumentRecord | undefined> {
  const database = await getDatabase();
  const transaction = database.transaction('documents', 'readwrite');
  const store = transaction.objectStore('documents');
  const existing = await store.get(id);
  if (!existing) {
    await transaction.done;
    return undefined;
  }
  const updated: DocumentRecord = {
    ...existing,
    editor,
    updatedAt: Date.now(),
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
  };
  await store.put(updated);
  await transaction.done;
  return updated;
}

export async function renameDocument(id: string, title: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction('documents', 'readwrite');
  const store = transaction.objectStore('documents');
  const existing = await store.get(id);
  if (existing) {
    await store.put({ ...existing, title, updatedAt: Date.now() });
  }
  await transaction.done;
}

export async function updateDocumentSourcePageCount(id: string, pageCount: number): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction('documents', 'readwrite');
  const store = transaction.objectStore('documents');
  const existing = await store.get(id);
  if (existing && existing.source.pageCount !== pageCount) {
    await store.put({
      ...existing,
      source: { ...existing.source, pageCount },
    });
  }
  await transaction.done;
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(['documents', 'assets'], 'readwrite');
  const documents = transaction.objectStore('documents');
  const document = await documents.get(id);
  if (document) {
    await documents.delete(id);
    await transaction.objectStore('assets').delete(document.source.assetId);
  }
  await transaction.done;
}

export async function deleteAllLocalData(): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(['documents', 'assets'], 'readwrite');
  await transaction.objectStore('documents').clear();
  await transaction.objectStore('assets').clear();
  await transaction.done;
}

export async function getStorageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}
