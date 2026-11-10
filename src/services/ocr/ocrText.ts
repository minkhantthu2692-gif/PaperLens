import { reflowText } from '@/services/text/reflow';

/**
 * Reconstructs OCR output into paragraphs. The implementation lives in the shared text
 * service so deterministic cleanup tools can reuse the same behavior.
 */
export const reconstructOcrText = reflowText;

export function combineOcrPages(pages: string[]): string {
  return pages
    .map((page) => page.trim())
    .filter(Boolean)
    .join('\n\n');
}
