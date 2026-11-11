import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION, type DocumentRecord, type SourceAsset } from '@/domain/document';
import { DEFAULT_REFINEMENT_PARAMS } from '@/domain/refinement';

const databaseRef = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./db', () => ({
  getDatabase: () => Promise.resolve(databaseRef.current),
}));

interface FakeStores {
  documents: Map<string, DocumentRecord>;
  assets: Map<string, SourceAsset>;
}

function createFakeDatabase(stores: FakeStores) {
  const store = (name: keyof FakeStores) => {
    const records = stores[name];
    return {
      get: async (key: string) => records.get(key),
      put: async (value: { id: string }) => {
        records.set(value.id, value as never);
      },
      add: async (value: { id: string }) => {
        records.set(value.id, value as never);
      },
      delete: async (key: string) => {
        records.delete(key);
      },
    };
  };
  return {
    transaction: () => ({
      objectStore: (name: keyof FakeStores) => store(name),
      done: Promise.resolve(),
    }),
  };
}

function seed(): FakeStores {
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
    },
    editor: { html: '', text: '', json: null },
  };
  const asset: SourceAsset = {
    id: 'asset-original',
    blob: new Blob(['original-scan'], { type: 'image/png' }),
    mimeType: 'image/png',
    fileName: 'scan.png',
    size: 13,
    createdAt: 0,
  };
  return {
    documents: new Map([[document.id, document]]),
    assets: new Map([[asset.id, asset]]),
  };
}

let stores: FakeStores;

beforeEach(() => {
  stores = seed();
  databaseRef.current = createFakeDatabase(stores);
});

describe('refined image storage', () => {
  it('keeps the original asset and adds a derived refined copy', async () => {
    const { saveRefinedImage } = await import('./documents');

    const saved = await saveRefinedImage('doc-1', {
      blob: new Blob(['refined-image'], { type: 'image/png' }),
      mimeType: 'image/png',
      fileName: 'scan-refined.png',
      width: 100,
      height: 80,
      preset: 'document',
      params: { ...DEFAULT_REFINEMENT_PARAMS, contrast: 12 },
    });

    expect(saved).toBeDefined();
    expect(saved?.document.source.refined?.assetId).toBe(saved?.asset.id);
    expect(saved?.document.source.refined?.width).toBe(100);
    expect(saved?.document.source.assetId).toBe('asset-original');
    expect(stores.assets.size).toBe(2);
    const original = stores.assets.get('asset-original');
    expect(original?.size).toBe(13);
    expect(original?.blob.type).toBe('image/png');
    expect(original?.blob).not.toBe(saved?.asset.blob);
  });

  it('replaces the previous refined copy instead of accumulating versions', async () => {
    const { saveRefinedImage } = await import('./documents');

    const first = await saveRefinedImage('doc-1', {
      blob: new Blob(['first'], { type: 'image/png' }),
      mimeType: 'image/png',
      fileName: 'scan-refined.png',
      width: 100,
      height: 80,
      preset: 'document',
      params: DEFAULT_REFINEMENT_PARAMS,
    });
    const second = await saveRefinedImage('doc-1', {
      blob: new Blob(['second'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      fileName: 'scan-refined.jpg',
      width: 90,
      height: 70,
      preset: 'camera',
      params: DEFAULT_REFINEMENT_PARAMS,
    });

    expect(stores.assets.size).toBe(2);
    expect(first?.asset.id).not.toBe(second?.asset.id);
    expect(stores.assets.has(first?.asset.id ?? '')).toBe(false);
    expect(stores.assets.has('asset-original')).toBe(true);
  });

  it('removes only the refined copy when reverted', async () => {
    const { saveRefinedImage, clearRefinedImage } = await import('./documents');

    await saveRefinedImage('doc-1', {
      blob: new Blob(['refined-image'], { type: 'image/png' }),
      mimeType: 'image/png',
      fileName: 'scan-refined.png',
      width: 100,
      height: 80,
      preset: null,
      params: DEFAULT_REFINEMENT_PARAMS,
    });

    const updated = await clearRefinedImage('doc-1');

    expect(updated?.source.refined).toBeUndefined();
    expect(stores.assets.size).toBe(1);
    expect(stores.assets.has('asset-original')).toBe(true);
  });

  it('deletes both the original and refined assets with the document', async () => {
    const { saveRefinedImage, deleteDocument } = await import('./documents');

    await saveRefinedImage('doc-1', {
      blob: new Blob(['refined-image'], { type: 'image/png' }),
      mimeType: 'image/png',
      fileName: 'scan-refined.png',
      width: 100,
      height: 80,
      preset: null,
      params: DEFAULT_REFINEMENT_PARAMS,
    });

    await deleteDocument('doc-1');

    expect(stores.documents.size).toBe(0);
    expect(stores.assets.size).toBe(0);
  });
});
