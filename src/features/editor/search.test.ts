import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { findMatches } from './search';

const schema = getSchema([StarterKit]);

function docWithParagraphs(paragraphs: string[]) {
  return schema.node(
    'doc',
    null,
    paragraphs.map((text) => schema.node('paragraph', null, [schema.text(text)])),
  );
}

function matches(
  doc: ReturnType<typeof docWithParagraphs>,
  options: Parameters<typeof findMatches>[1],
) {
  return findMatches(doc, options).matches;
}

describe('findMatches', () => {
  it('returns no matches for an empty query', () => {
    expect(matches(docWithParagraphs(['Hello world']), { query: '' })).toEqual([]);
  });

  it('finds matches and maps them to document positions', () => {
    const doc = docWithParagraphs(['Hello world', 'abc']);

    expect(matches(doc, { query: 'world' })).toEqual([{ from: 7, to: 12 }]);
    expect(matches(doc, { query: 'abc' })).toEqual([{ from: 14, to: 17 }]);
  });

  it('finds matches that span inline formatting boundaries', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('Hello '),
        schema.text('world', [schema.marks.bold!.create()]),
      ]),
    ]);

    expect(matches(doc, { query: 'lo wo' })).toEqual([{ from: 4, to: 9 }]);
  });

  it('is case-insensitive unless match case is enabled', () => {
    const doc = docWithParagraphs(['Apple apple APPLE']);

    expect(matches(doc, { query: 'apple' })).toHaveLength(3);
    expect(matches(doc, { query: 'apple', matchCase: true })).toEqual([{ from: 7, to: 12 }]);
  });

  it('treats the query literally instead of as a regular expression', () => {
    const doc = docWithParagraphs(['cost is $5.00 (approx.)']);

    expect(matches(doc, { query: '$5.00' })).toEqual([{ from: 9, to: 14 }]);
    expect(matches(doc, { query: '(approx.)' })).toEqual([{ from: 15, to: 24 }]);
  });

  it('skips matches that are part of a larger word when whole word is enabled', () => {
    const doc = docWithParagraphs(['cat category cat']);

    expect(matches(doc, { query: 'cat' })).toHaveLength(3);
    expect(matches(doc, { query: 'cat', wholeWord: true })).toEqual([
      { from: 1, to: 4 },
      { from: 14, to: 17 },
    ]);
  });

  it('does not count overlapping hits twice', () => {
    const doc = docWithParagraphs(['aaa']);

    expect(matches(doc, { query: 'aa' })).toEqual([{ from: 1, to: 3 }]);
  });

  it('limits matches to the requested range', () => {
    const doc = docWithParagraphs(['alpha beta alpha', 'alpha']);

    expect(matches(doc, { query: 'alpha' })).toHaveLength(3);
    expect(matches(doc, { query: 'alpha', range: { from: 1, to: 17 } })).toHaveLength(2);
  });

  it('returns safely when the query does not exist', () => {
    expect(matches(docWithParagraphs(['Hello world']), { query: 'zebra' })).toEqual([]);
  });
});
