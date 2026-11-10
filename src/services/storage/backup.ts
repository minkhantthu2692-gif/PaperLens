import type { DocumentRecord, EditorContent, SourceKind } from '@/domain/document';
import { base64ToBlob, blobToBase64 } from '@/lib/file';
import { createId } from '@/lib/id';
import { getDatabase } from './db';
import { listDocuments } from './documents';

const BACKUP_FORMAT = 'paperlens-backup';
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 150 * 1024 * 1024;

interface BackupSource {
  kind: SourceKind;
  mimeType: string;
  fileName: string;
  size: number;
  pageCount?: number;
  base64: string;
}

interface BackupDocument {
  title: string;
  createdAt: number;
  updatedAt: number;
  editor: EditorContent;
  source: BackupSource;
}

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  documents: BackupDocument[];
}

export type BackupErrorCode = 'empty' | 'invalid' | 'too-large' | 'unsupported-version';

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode) {
    super(code);
    this.name = 'BackupError';
    this.code = code;
  }
}

export async function createBackup(): Promise<{ blob: Blob; fileName: string }> {
  const database = await getDatabase();
  const documents = await listDocuments();
  const entries: BackupDocument[] = [];

  for (const document of documents) {
    const asset = await database.get('assets', document.source.assetId);
    if (!asset) {
      continue;
    }
    entries.push({
      title: document.title,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      editor: document.editor,
      source: {
        kind: document.source.kind,
        mimeType: document.source.mimeType,
        fileName: document.source.fileName,
        size: document.source.size,
        ...(document.source.pageCount !== undefined
          ? { pageCount: document.source.pageCount }
          : {}),
        base64: await blobToBase64(asset.blob),
      },
    });
  }

  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    documents: entries,
  };

  const date = new Date().toISOString().slice(0, 10);
  return {
    blob: new Blob([JSON.stringify(backup)], { type: 'application/json' }),
    fileName: `paperlens-backup-${date}.json`,
  };
}

function isEditorContent(value: unknown): value is EditorContent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const editor = value as Partial<EditorContent>;
  return typeof editor.html === 'string' && typeof editor.text === 'string';
}

function isSourceKind(value: unknown): value is SourceKind {
  return value === 'pdf' || value === 'image' || value === 'text';
}

function parseBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') {
    throw new BackupError('invalid');
  }
  const candidate = raw as Partial<BackupFile>;
  if (candidate.format !== BACKUP_FORMAT) {
    throw new BackupError('invalid');
  }
  if (candidate.version !== BACKUP_VERSION) {
    throw new BackupError('unsupported-version');
  }
  if (!Array.isArray(candidate.documents)) {
    throw new BackupError('invalid');
  }
  for (const item of candidate.documents) {
    if (!item || typeof item !== 'object') {
      throw new BackupError('invalid');
    }
    const entry = item as Partial<BackupDocument>;
    if (typeof entry.title !== 'string' || !isEditorContent(entry.editor) || !entry.source) {
      throw new BackupError('invalid');
    }
    if (
      !isSourceKind(entry.source.kind) ||
      typeof entry.source.mimeType !== 'string' ||
      typeof entry.source.fileName !== 'string' ||
      typeof entry.source.base64 !== 'string'
    ) {
      throw new BackupError('invalid');
    }
  }
  return candidate as BackupFile;
}

export async function restoreBackup(file: File): Promise<number> {
  if (file.size === 0) {
    throw new BackupError('empty');
  }
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupError('too-large');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new BackupError('invalid');
  }

  const backup = parseBackup(parsed);
  const database = await getDatabase();
  const existingTitles = new Set((await listDocuments()).map((document) => document.title));
  const now = Date.now();

  const transaction = database.transaction(['documents', 'assets'], 'readwrite');
  const documentsStore = transaction.objectStore('documents');
  const assetsStore = transaction.objectStore('assets');

  for (const entry of backup.documents) {
    const assetId = createId();
    const documentId = createId();
    const title = existingTitles.has(entry.title) ? `${entry.title} (restored)` : entry.title;
    existingTitles.add(title);

    const blob = base64ToBlob(entry.source.base64, entry.source.mimeType);
    if (blob.size === 0) {
      throw new BackupError('invalid');
    }

    const document: DocumentRecord = {
      id: documentId,
      title,
      createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : now,
      updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : now,
      schemaVersion: 1,
      source: {
        assetId,
        kind: entry.source.kind,
        mimeType: entry.source.mimeType,
        fileName: entry.source.fileName,
        size: blob.size,
        ...(typeof entry.source.pageCount === 'number'
          ? { pageCount: entry.source.pageCount }
          : {}),
      },
      editor: entry.editor,
    };

    await assetsStore.add({
      id: assetId,
      blob,
      mimeType: entry.source.mimeType,
      fileName: entry.source.fileName,
      size: blob.size,
      createdAt: now,
    });
    await documentsStore.add(document);
  }

  await transaction.done;
  return backup.documents.length;
}
