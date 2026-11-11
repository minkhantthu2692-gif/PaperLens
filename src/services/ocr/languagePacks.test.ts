import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
}));

vi.mock('idb-keyval', () => storeMocks);

import {
  installLanguagePack,
  isAbortError,
  LanguagePackError,
  listInstalledLanguageCodes,
  OPTIONAL_LANGUAGE_PACKS,
  removeLanguagePack,
  type LanguagePack,
} from './languagePacks';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fakeResponse(content: Uint8Array, ok = true): Response {
  return {
    ok,
    headers: { get: () => null },
    body: null,
    arrayBuffer: async () => content.buffer,
  } as unknown as Response;
}

function stubDigestFor(value: string) {
  const digest = createHash('sha256').update(value).digest();
  const buffer = digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
  vi.stubGlobal('crypto', {
    subtle: { digest: vi.fn().mockResolvedValue(buffer) },
  });
}

const testPack: LanguagePack = {
  code: 'tst',
  name: 'Test',
  nativeName: 'Test',
  size: 5,
  sha256: sha256('hello'),
  url: 'https://example.test/tst.traineddata',
};

beforeEach(() => {
  storeMocks.set.mockResolvedValue(undefined);
  storeMocks.del.mockResolvedValue(undefined);
  storeMocks.keys.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('optional language pack catalog', () => {
  it('has unique codes and valid checksums', () => {
    const codes = new Set<string>();
    for (const pack of OPTIONAL_LANGUAGE_PACKS) {
      expect(pack.code).toMatch(/^[a-z_]+$/);
      expect(codes.has(pack.code)).toBe(false);
      codes.add(pack.code);
      expect(pack.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(pack.size).toBeGreaterThan(0);
      expect(pack.url).toContain(
        'raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd',
      );
    }
  });
});

describe('listInstalledLanguageCodes', () => {
  it('reads tesseract cache keys and ignores unrelated keys', async () => {
    storeMocks.keys.mockResolvedValue(['./fra.traineddata', './deu.traineddata', 'other']);
    await expect(listInstalledLanguageCodes()).resolves.toEqual(new Set(['fra', 'deu']));
  });
});

describe('installLanguagePack', () => {
  it('verifies and stores the package in the tesseract cache', async () => {
    const progress = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeResponse(new TextEncoder().encode('hello'))),
    );
    stubDigestFor('hello');

    await installLanguagePack(testPack, progress);

    expect(storeMocks.set).toHaveBeenCalledTimes(1);
    const [key, value] = storeMocks.set.mock.calls[0] as [string, Uint8Array];
    expect(key).toBe('./tst.traineddata');
    expect(Array.from(value)).toEqual(Array.from(new TextEncoder().encode('hello')));
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it('rejects a download whose checksum does not match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeResponse(new TextEncoder().encode('tampered'))),
    );
    stubDigestFor('not-hello');

    await expect(installLanguagePack({ ...testPack, size: 8 }, undefined)).rejects.toMatchObject({
      code: 'integrity',
    });
    expect(storeMocks.set).not.toHaveBeenCalled();
  });

  it('reports HTTP failures without storing anything', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(new Uint8Array(), false)));

    await expect(installLanguagePack(testPack)).rejects.toBeInstanceOf(LanguagePackError);
    expect(storeMocks.set).not.toHaveBeenCalled();
  });
});

describe('removeLanguagePack', () => {
  it('deletes the matching tesseract cache key', async () => {
    await removeLanguagePack('fra');
    expect(storeMocks.del).toHaveBeenCalledWith('./fra.traineddata');
  });
});

describe('isAbortError', () => {
  it('detects AbortError objects', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('nope'))).toBe(false);
  });
});
