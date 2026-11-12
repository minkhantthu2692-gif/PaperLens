import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface SearchOptions {
  query: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  /** When set, matches must be fully contained inside this document range. */
  range?: { from: number; to: number } | null;
}

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchResult {
  matches: SearchMatch[];
  /** True when the match limit stopped the search early. */
  truncated: boolean;
}

/** Guards against pathological multi-megabyte documents freezing the UI. */
export const MAX_SEARCH_MATCHES = 2000;

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

interface TextBlock {
  text: string;
  /** Document position of each character in `text`. */
  positions: number[];
}

function collectTextBlocks(doc: ProseMirrorNode): TextBlock[] {
  const blocks: TextBlock[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }
    const characters: string[] = [];
    const positions: number[] = [];

    node.forEach((child, offset) => {
      if (child.isText) {
        const start = pos + 1 + offset;
        const text = child.text ?? '';
        for (let index = 0; index < text.length; index += 1) {
          characters.push(text[index] as string);
          positions.push(start + index);
        }
      } else if (child.type.name === 'hardBreak') {
        // Treat a soft line break as a character so offsets stay predictable,
        // while the boundary still prevents matching across blocks.
        characters.push('\n');
        positions.push(pos + 1 + offset);
      }
    });

    blocks.push({ text: characters.join(''), positions });
    return false;
  });

  return blocks;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && WORD_CHARACTER.test(character);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWholeWordMatch(text: string, start: number, length: number): boolean {
  return !isWordCharacter(text[start - 1]) && !isWordCharacter(text[start + length]);
}

/**
 * Finds literal, non-overlapping matches inside the editor document.
 * Matches are scoped to a single text block and mapped back to ProseMirror
 * positions so the caller can highlight or replace them without touching the
 * document's formatting.
 */
export function findMatches(doc: ProseMirrorNode, options: SearchOptions): SearchResult {
  const query = options.query;
  if (!query) {
    return { matches: [], truncated: false };
  }

  const matchCase = options.matchCase ?? false;
  const wholeWord = options.wholeWord ?? false;
  const range = options.range ?? null;
  const matches: SearchMatch[] = [];
  // Unicode-aware case-insensitive matching keeps indices aligned with the
  // original string even when lower-casing would change its length.
  const pattern = new RegExp(escapeRegExp(query), matchCase ? 'gu' : 'giu');

  for (const block of collectTextBlocks(doc)) {
    const needle = new RegExp(pattern.source, pattern.flags);
    let found = needle.exec(block.text);

    while (found) {
      const start = found.index;
      const length = found[0].length;
      const startPosition = block.positions[start];
      const endPosition = block.positions[start + length - 1];
      const inRange =
        !range ||
        (startPosition !== undefined &&
          endPosition !== undefined &&
          startPosition >= range.from &&
          endPosition + 1 <= range.to);
      const wholeWordMatch = !wholeWord || isWholeWordMatch(block.text, start, length);

      if (startPosition !== undefined && endPosition !== undefined && inRange && wholeWordMatch) {
        if (matches.length >= MAX_SEARCH_MATCHES) {
          return { matches, truncated: true };
        }
        matches.push({ from: startPosition, to: endPosition + 1 });
      }

      found = needle.exec(block.text);
    }
  }

  return { matches, truncated: false };
}
