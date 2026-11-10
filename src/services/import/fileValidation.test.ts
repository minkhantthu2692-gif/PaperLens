import { describe, expect, it } from 'vitest';
import { classifySourceFile, MAX_SOURCE_BYTES, titleFromFileName } from './fileValidation';
import type { ImportValidationError } from './fileValidation';

if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
      reader.readAsArrayBuffer(this);
    });
  };
}

function makeFile(name: string, bytes: number[], type = 'application/octet-stream'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function makeTextFile(name: string, text: string): File {
  return new File([text], name, { type: 'text/plain' });
}

async function expectCode(file: File, code: ImportValidationError['code']): Promise<void> {
  await expect(classifySourceFile(file)).rejects.toMatchObject({
    name: 'ImportValidationError',
    code,
  });
}

describe('classifySourceFile', () => {
  it('accepts a PDF with a valid signature', async () => {
    await expect(
      classifySourceFile(
        makeFile(
          'book.pdf',
          Array.from('%PDF-1.7', (character) => character.charCodeAt(0)),
        ),
      ),
    ).resolves.toEqual({ kind: 'pdf', mimeType: 'application/pdf' });
  });

  it('accepts PNG, JPEG, and WebP signatures', async () => {
    await expect(
      classifySourceFile(makeFile('scan.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).resolves.toEqual({ kind: 'image', mimeType: 'image/png' });
    await expect(
      classifySourceFile(makeFile('photo.jpg', [0xff, 0xd8, 0xff, 0xe0])),
    ).resolves.toEqual({ kind: 'image', mimeType: 'image/jpeg' });
    await expect(
      classifySourceFile(
        makeFile('image.webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).resolves.toEqual({ kind: 'image', mimeType: 'image/webp' });
  });

  it('accepts UTF-8 text files', async () => {
    await expect(classifySourceFile(makeTextFile('notes.txt', 'Hello\nမြန်မာစာ'))).resolves.toEqual(
      { kind: 'text', mimeType: 'text/plain' },
    );
  });

  it('rejects empty files', async () => {
    await expectCode(makeFile('empty.pdf', []), 'empty');
  });

  it('rejects files whose contents do not match their extension', async () => {
    await expectCode(makeFile('fake.pdf', [0x50, 0x4b, 0x03, 0x04]), 'corrupt');
    await expectCode(makeFile('fake.png', [0xff, 0xd8, 0xff]), 'corrupt');
    await expectCode(makeTextFile('binary.txt', 'text\u0000binary'), 'corrupt');
  });

  it('rejects unsupported extensions', async () => {
    await expectCode(makeTextFile('notes.docx', 'hello'), 'unsupported');
  });

  it('rejects files over the size limit before parsing', async () => {
    const file = makeFile(
      'large.pdf',
      Array.from('%PDF-1.7', (character) => character.charCodeAt(0)),
    );
    Object.defineProperty(file, 'size', { value: MAX_SOURCE_BYTES + 1 });
    await expectCode(file, 'too-large');
  });
});

describe('titleFromFileName', () => {
  it('removes the extension and normalizes whitespace', () => {
    expect(titleFromFileName('  Annual   Report 2026.pdf')).toBe('Annual Report 2026');
  });

  it('falls back when the name has no usable characters', () => {
    expect(titleFromFileName('.txt')).toBe('Untitled document');
  });
});
