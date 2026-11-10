import { describe, expect, it } from 'vitest';
import { combineOcrPages, reconstructOcrText } from './ocrText';

describe('reconstructOcrText', () => {
  it('joins OCR line breaks into paragraphs', () => {
    expect(reconstructOcrText('The quick brown\nfox jumps over\nthe lazy dog.')).toBe(
      'The quick brown fox jumps over the lazy dog.',
    );
  });

  it('keeps blank-line paragraph boundaries', () => {
    expect(reconstructOcrText('First line\ncontinues.\n\nSecond paragraph.')).toBe(
      'First line continues.\n\nSecond paragraph.',
    );
  });

  it('keeps list items on their own lines', () => {
    expect(reconstructOcrText('Intro line\n- First item\n- Second item')).toBe(
      'Intro line\n\n- First item\n\n- Second item',
    );
  });

  it('normalizes whitespace and line endings without changing characters', () => {
    expect(reconstructOcrText('  Hello\u00a0world  \r\nnext   line\t\r\n')).toBe(
      'Hello world next line',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(reconstructOcrText(' \n\n \t')).toBe('');
  });
});

describe('combineOcrPages', () => {
  it('joins non-empty pages with a blank line', () => {
    expect(combineOcrPages(['Page one', '  ', 'Page two'])).toBe('Page one\n\nPage two');
  });
});
