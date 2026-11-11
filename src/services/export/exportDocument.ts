import DOMPurify from 'dompurify';
import type { JSONContent } from '@tiptap/react';
import { downloadBlob, sanitizeFileName } from '@/lib/file';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function exportPlainText(title: string, text: string): void {
  downloadBlob(
    new Blob([text], { type: 'text/plain;charset=utf-8' }),
    `${sanitizeFileName(title)}.txt`,
  );
}

export function buildHtmlDocument(title: string, html: string): string {
  const sanitizedBody = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 46rem; margin: 2rem auto; padding: 0 1.25rem; font-family: Georgia, 'Noto Serif', 'Noto Serif Myanmar', serif; line-height: 1.65; color: #111827; }
  h1, h2, h3 { line-height: 1.25; }
  blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid #c7d2fe; color: #374151; }
  p { margin: 0 0 1rem; }
  li { margin-bottom: 0.35rem; }
</style>
</head>
<body>
${sanitizedBody}
</body>
</html>`;
}

export function exportHtml(title: string, html: string): void {
  downloadBlob(
    new Blob([buildHtmlDocument(title, html)], { type: 'text/html;charset=utf-8' }),
    `${sanitizeFileName(title)}.html`,
  );
}

export async function exportDocx(title: string, content: JSONContent): Promise<void> {
  const { createDocxBlob } = await import('./docxExport');
  const blob = await createDocxBlob(title, content);
  downloadBlob(blob, `${sanitizeFileName(title)}.docx`);
}

export function printDocument(title: string, html: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Print window blocked');
  }
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildHtmlDocument(title, html));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
