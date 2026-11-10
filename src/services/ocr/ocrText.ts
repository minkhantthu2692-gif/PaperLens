/**
 * Conservatively reconstructs paragraph text from raw OCR output.
 *
 * OCR engines emit one line per visual line. Joining those lines restores readable paragraphs
 * while blank lines and list markers keep intentional structure. No characters are invented or
 * removed beyond whitespace normalization.
 */
export function reconstructOcrText(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd());

  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const paragraph = current
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (paragraph) {
      paragraphs.push(paragraph);
    }
    current = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^(?:[-*•·]|\d{1,3}[.)])\s+/.test(line)) {
      flush();
      paragraphs.push(line);
      continue;
    }
    current.push(line);
  }
  flush();

  return paragraphs.join('\n\n');
}

export function combineOcrPages(pages: string[]): string {
  return pages
    .map((page) => page.trim())
    .filter(Boolean)
    .join('\n\n');
}
