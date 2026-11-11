export const PARAGRAPH_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

export type ParagraphAlignment = (typeof PARAGRAPH_ALIGNMENTS)[number];

export function getParagraphAlignment(value: unknown): ParagraphAlignment {
  return PARAGRAPH_ALIGNMENTS.find((alignment) => alignment === value) ?? 'left';
}
