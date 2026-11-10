import { reflowText } from './reflow';

export interface CleanupOptions {
  normalizeUnicode: boolean;
  normalizeWhitespace: boolean;
  repairHyphenation: boolean;
  reflowLines: boolean;
  removeDuplicateLines: boolean;
}

export const DEFAULT_CLEANUP_OPTIONS: CleanupOptions = {
  normalizeUnicode: true,
  normalizeWhitespace: true,
  repairHyphenation: true,
  reflowLines: true,
  removeDuplicateLines: false,
};

const UNICODE_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

/**
 * Applies canonical Unicode normalization and replaces non-breaking/wide spaces with a
 * regular space. Joiners and other meaningful control characters are left untouched.
 */
export function normalizeUnicodeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(UNICODE_SPACES, ' ')
    .replace(/[\ufeff\u00ad]/g, '');
}

/** Collapses repeated spaces, trims line ends, and caps runs of blank lines. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Repairs a conservative subset of line-end hyphenation: a hyphen between two lowercase
 * letters split across a line break is joined. Mixed-case and compound cases keep the hyphen.
 */
export function repairLineHyphenation(text: string): string {
  return text.replace(/(\p{Ll})-[ \t]*\n[ \t]*(\p{Ll})/gu, '$1$2');
}

/** Removes consecutive duplicate non-empty lines, such as repeated OCR artifacts. */
export function removeDuplicateLines(text: string): string {
  const kept: string[] = [];
  let previous: string | null = null;

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const normalized = line.trim();
    if (normalized && normalized === previous) {
      continue;
    }
    kept.push(line);
    previous = normalized;
  }

  return kept.join('\n');
}

/**
 * Runs the selected deterministic cleanups in a fixed order so results are predictable.
 * No option is applied implicitly.
 */
export function cleanupText(text: string, options: CleanupOptions): string {
  let result = text;
  if (options.normalizeUnicode) {
    result = normalizeUnicodeText(result);
  }
  if (options.repairHyphenation) {
    result = repairLineHyphenation(result);
  }
  if (options.removeDuplicateLines) {
    result = removeDuplicateLines(result);
  }
  if (options.reflowLines) {
    result = reflowText(result);
  }
  if (options.normalizeWhitespace) {
    result = normalizeWhitespace(result);
  }
  return result;
}

/** Converts cleaned plain text into safe paragraph HTML for insertion into the editor. */
export function textToHtmlParagraphs(text: string): string {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
