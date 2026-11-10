import { describe, expect, it } from 'vitest';
import {
  cleanupText,
  DEFAULT_CLEANUP_OPTIONS,
  normalizeUnicodeText,
  normalizeWhitespace,
  removeDuplicateLines,
  repairLineHyphenation,
  textToHtmlParagraphs,
} from './cleanup';
import { reflowText } from './reflow';

describe('normalizeUnicodeText', () => {
  it('applies NFC normalization and replaces non-breaking spaces', () => {
    expect(normalizeUnicodeText('Cafe\u0301\u00a0menu')).toBe('Café menu');
  });

  it('removes soft hyphens and stray byte-order marks', () => {
    expect(normalizeUnicodeText('\ufeffhy\u00adphen')).toBe('hyphen');
  });
});

describe('normalizeWhitespace', () => {
  it('collapses repeated spaces and caps blank lines', () => {
    expect(normalizeWhitespace('  Hello   world  \r\n\r\n\r\nNext\tline  ')).toBe(
      'Hello world\n\nNext line',
    );
  });
});

describe('repairLineHyphenation', () => {
  it('joins lowercase words split across a line break', () => {
    expect(repairLineHyphenation('docu-\nment')).toBe('document');
  });

  it('keeps hyphens before capitalized or non-letter text', () => {
    expect(repairLineHyphenation('well-\nKnown')).toBe('well-\nKnown');
    expect(repairLineHyphenation('item-\n42')).toBe('item-\n42');
  });
});

describe('removeDuplicateLines', () => {
  it('removes consecutive duplicate non-empty lines', () => {
    expect(removeDuplicateLines('Title\nTitle\nBody\nBody\n\nBody')).toBe('Title\nBody\n\nBody');
  });
});

describe('reflowText', () => {
  it('joins visual lines into paragraphs while keeping list items', () => {
    expect(reflowText('Intro line\ncontinues here.\n- First\n- Second')).toBe(
      'Intro line continues here.\n\n- First\n\n- Second',
    );
  });
});

describe('cleanupText', () => {
  it('applies selected options in a deterministic order', () => {
    const result = cleanupText('Head\u00a0line\nHead line\nA docu-\nment with   spacing.', {
      ...DEFAULT_CLEANUP_OPTIONS,
      removeDuplicateLines: true,
    });
    expect(result).toBe('Head line A document with spacing.');
  });

  it('returns the original text when every option is disabled', () => {
    const text = 'Keep\n  this\tas-is.';
    expect(
      cleanupText(text, {
        normalizeUnicode: false,
        normalizeWhitespace: false,
        repairHyphenation: false,
        reflowLines: false,
        removeDuplicateLines: false,
      }),
    ).toBe(text);
  });
});

describe('textToHtmlParagraphs', () => {
  it('escapes markup and preserves paragraph breaks', () => {
    expect(textToHtmlParagraphs('<b>One</b>\n\nTwo & three')).toBe(
      '<p>&lt;b&gt;One&lt;/b&gt;</p><p>Two &amp; three</p>',
    );
  });
});
