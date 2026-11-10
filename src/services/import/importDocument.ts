import type { DocumentRecord } from '@/domain/document';
import { createDocumentFromFile } from '@/services/storage/documents';
import { classifySourceFile, titleFromFileName } from './fileValidation';

export async function importDocumentFile(file: File): Promise<DocumentRecord> {
  const classified = await classifySourceFile(file);
  return createDocumentFromFile({
    file,
    kind: classified.kind,
    mimeType: classified.mimeType,
    title: titleFromFileName(file.name),
  });
}
