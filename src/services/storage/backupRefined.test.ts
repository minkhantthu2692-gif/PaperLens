import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION, type DocumentRecord, type SourceAsset } from '@/domain/document';
import { DEFAULT_REFINEMENT_PARAMS } from '@/domain/refinement';

const databaseRef = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./db', () => ({ getDatabase: () => Promise.resolve(databaseRef.current) }));

const document: DocumentRecord = {
  id: 'doc-1',
  title: 'Scan',
  createdAt: 0,
  updatedAt: 0,
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
  source: {
    assetId: 'asset-original',
    kind: 'image',
    mimeType: 'image/png',
    fileName: 'scan.png',
    size: 13,
    refined: {
      assetId: 'asset-refined',
      mimeType: 'image/jpeg',
      fileName: 'scan-refined.jpg',
      size: 14,
      width: 100,
      height: 80,
      appliedAt: 123,
      preset: 'document',
      params: { ...DEFAULT_REFINEMENT_PARAMS, contrast: 12 },
    },
  },
  editor: { html: '', text: '', json: null },
};

const assets = new Map<string, SourceAsset>([
  [
    'asset-original',
    {
      id: 'asset-original',
      blob: new Blob(['original-scan'], { type: 'image/png' }),
      mimeType: 'image/png',
      fileName: 'scan.png',
      size: 13,
      createdAt: 0,
    },
  ],
  [
    'asset-refined',
    {
      id: 'asset-refined',
      blob: new Blob(['refined-image'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      fileName: 'scan-refined.jpg',
      size: 14,
      createdAt: 0,
    },
  ],
]);

beforeEach(() => {
  databaseRef.current = {
    getAllFromIndex: async () => [document],
    get: async (_store: string, key: string) => assets.get(key),
  };
});

function installBlobText(): void {
  if (typeof Blob.prototype.text === 'function') {
    return;
  }
  Object.defineProperty(Blob.prototype, 'text', {
    configurable: true,
    value: function text(this: Blob) {
      return readBlobText(this);
    },
  });
}

describe('backup with a refined image', () => {
  it('restores the original and the refined copy from a backup', async () => {
    installBlobText();
    const documents = new Map<string, unknown>();
    const restoredAssets = new Map<string, unknown>();
    databaseRef.current = {
      getAllFromIndex: async () => [],
      transaction: () => ({
        objectStore: (name: string) => ({
          add: async (value: { id: string }) => {
            (name === 'documents' ? documents : restoredAssets).set(value.id, value);
          },
        }),
        done: Promise.resolve(),
      }),
    };
    const backup = {
      format: 'paperlens-backup',
      version: 1,
      exportedAt: 0,
      documents: [
        {
          title: 'Restored scan',
          createdAt: 0,
          updatedAt: 0,
          editor: { html: '', text: '', json: null },
          source: {
            kind: 'image',
            mimeType: 'image/png',
            fileName: 'scan.png',
            size: 8,
            base64: 'b3JpZ2luYWw=',
            refined: {
              mimeType: 'image/jpeg',
              fileName: 'scan-refined.jpg',
              width: 100,
              height: 80,
              appliedAt: 5,
              preset: 'document',
              params: { ...DEFAULT_REFINEMENT_PARAMS, contrast: 12 },
              base64: 'cmVmaW5lZA==',
            },
          },
        },
      ],
    };
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });

    const { restoreBackup } = await import('./backup');
    const count = await restoreBackup(file);

    expect(count).toBe(1);
    expect(documents.size).toBe(1);
    expect(restoredAssets.size).toBe(2);
    const record = [...documents.values()][0] as {
      source: { refined?: { width: number; params: { contrast: number } } };
    };
    expect(record.source.refined?.width).toBe(100);
    expect(record.source.refined?.params.contrast).toBe(12);
  });

  it('stores the original and the derived refined copy', async () => {
    const { createBackup } = await import('./backup');

    const backup = await createBackup();
    const parsed = JSON.parse(await readBlobText(backup.blob)) as {
      documents: {
        source: {
          base64: string;
          refined?: { base64: string; params: Record<string, unknown> };
        };
      }[];
    };

    const source = parsed.documents[0]?.source;
    expect(source?.base64.length).toBeGreaterThan(0);
    expect(source?.refined?.base64.length).toBeGreaterThan(0);
    expect(source?.refined?.base64).not.toBe(source?.base64);
    expect(source?.refined?.params?.['contrast']).toBe(12);
  });
});

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}
