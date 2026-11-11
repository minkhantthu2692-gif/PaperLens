import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadBlobMock } = vi.hoisted(() => ({ downloadBlobMock: vi.fn() }));

vi.mock('@/lib/file', () => ({
  downloadBlob: downloadBlobMock,
  sanitizeFileName: (value: string) => value,
}));

import { downloadBlob } from '@/lib/file';
import { buildHtmlDocument, exportPlainText, printDocument } from './exportDocument';

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read text export'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unexpected text export result'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsText(blob);
  });
}

describe('document exports', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    downloadBlobMock.mockClear();
  });

  it('keeps alignment styles for paragraphs, headings, and list content in HTML and print documents', () => {
    const html = buildHtmlDocument(
      'Aligned document',
      '<h2 style="text-align: right">Heading</h2><p style="text-align: justify">Paragraph</p><ul><li><p style="text-align: center">List item</p></li></ul>',
    );

    expect(html).toContain('<h2 style="text-align: right">Heading</h2>');
    expect(html).toContain('<p style="text-align: justify">Paragraph</p>');
    expect(html).toContain('<p style="text-align: center">List item</p>');
    expect(html).toContain('text-align: justify');
  });

  it('passes alignment styles to the browser print document used for PDF export', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window);
    const documentOpen = vi.spyOn(document, 'open').mockImplementation(() => window);
    const documentWrite = vi.spyOn(document, 'write').mockImplementation(() => undefined);
    const documentClose = vi.spyOn(document, 'close').mockImplementation(() => undefined);
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    printDocument('Print alignment', '<p style="text-align: justify">Justified</p>');

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(documentWrite).toHaveBeenCalledWith(
      expect.stringContaining('<p style="text-align: justify">Justified</p>'),
    );
    expect(documentOpen).toHaveBeenCalledOnce();
    expect(documentClose).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
  });

  it('preserves paragraph breaks in plain text without adding unsupported alignment markup', async () => {
    exportPlainText('Aligned document', 'First paragraph\n\nSecond paragraph');

    expect(vi.mocked(downloadBlob)).toHaveBeenCalledOnce();
    const [blob] = vi.mocked(downloadBlob).mock.calls[0] ?? [];
    expect(blob).toBeInstanceOf(Blob);
    if (!(blob instanceof Blob)) {
      throw new Error('Expected the plain-text export to be a Blob');
    }
    await expect(readBlob(blob)).resolves.toBe('First paragraph\n\nSecond paragraph');
  });
});
