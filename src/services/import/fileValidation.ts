import type { SourceKind } from '@/domain/document';

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARACTERS = 500_000;

export type ImportErrorCode = 'empty' | 'too-large' | 'unsupported' | 'corrupt';

export class ImportValidationError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode) {
    super(code);
    this.name = 'ImportValidationError';
    this.code = code;
  }
}

export interface ClassifiedFile {
  kind: SourceKind;
  mimeType: string;
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  return Array.from(text).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

function detectText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) {
    return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export async function classifySourceFile(file: File): Promise<ClassifiedFile> {
  if (file.size === 0) {
    throw new ImportValidationError('empty');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImportValidationError('too-large');
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.pdf')) {
    if (!hasAscii(header, 0, '%PDF-')) {
      throw new ImportValidationError('corrupt');
    }
    return { kind: 'pdf', mimeType: 'application/pdf' };
  }

  if (lowerName.endsWith('.png')) {
    if (!hasPrefix(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      throw new ImportValidationError('corrupt');
    }
    return { kind: 'image', mimeType: 'image/png' };
  }

  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    if (!hasPrefix(header, [0xff, 0xd8, 0xff])) {
      throw new ImportValidationError('corrupt');
    }
    return { kind: 'image', mimeType: 'image/jpeg' };
  }

  if (lowerName.endsWith('.webp')) {
    if (!hasAscii(header, 0, 'RIFF') || !hasAscii(header, 8, 'WEBP')) {
      throw new ImportValidationError('corrupt');
    }
    return { kind: 'image', mimeType: 'image/webp' };
  }

  if (lowerName.endsWith('.txt')) {
    const sample = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
    if (!detectText(sample)) {
      throw new ImportValidationError('corrupt');
    }
    if (file.size > MAX_TEXT_CHARACTERS * 4) {
      throw new ImportValidationError('too-large');
    }
    return { kind: 'text', mimeType: 'text/plain' };
  }

  throw new ImportValidationError('unsupported');
}

export function titleFromFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim();
  const normalized = baseName.replace(/\s+/g, ' ').slice(0, 120).trim();
  return normalized || 'Untitled document';
}
