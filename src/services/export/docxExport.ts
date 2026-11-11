import type { JSONContent } from '@tiptap/react';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';

type Mark = NonNullable<JSONContent['marks']>[number];
type Heading = (typeof HeadingLevel)[keyof typeof HeadingLevel];

const ORDERED_LIST_REFERENCE = 'paperlens-ordered-list';
const LIST_LEVELS = 6;
const HEADINGS: readonly Heading[] = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

interface ListContext {
  kind: 'bullet' | 'ordered';
  level: number;
}

interface ParagraphContext {
  list?: ListContext;
  quote?: boolean;
  indentLeft?: number;
}

function markAttribute(mark: Mark, key: string): unknown {
  return mark.attrs?.[key];
}

function hasMark(marks: readonly Mark[], type: string): boolean {
  return marks.some((mark) => mark.type === type);
}

function safeLinkHref(marks: readonly Mark[]): string | null {
  const link = marks.find((mark) => mark.type === 'link');
  const href = link ? markAttribute(link, 'href') : null;
  if (typeof href !== 'string') {
    return null;
  }
  const trimmed = href.trim();
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
}

function createRun(node: JSONContent, marks: readonly Mark[]): ParagraphChild {
  let options: IRunOptions = { text: node.text ?? '' };

  if (hasMark(marks, 'bold')) {
    options = { ...options, bold: true };
  }
  if (hasMark(marks, 'italic')) {
    options = { ...options, italics: true };
  }
  if (hasMark(marks, 'underline')) {
    options = { ...options, underline: { type: UnderlineType.SINGLE } };
  }
  if (hasMark(marks, 'strike')) {
    options = { ...options, strike: true };
  }
  if (hasMark(marks, 'code')) {
    options = { ...options, font: 'Consolas', size: 20, shading: { fill: 'F3F4F6' } };
  }

  const href = safeLinkHref(marks);
  if (href) {
    options = {
      ...options,
      color: '1155CC',
      underline: { type: UnderlineType.SINGLE },
    };
  }

  const run = new TextRun(options);
  return href ? new ExternalHyperlink({ link: href, children: [run] }) : run;
}

function inlineChildren(
  content: readonly JSONContent[] | undefined,
  inheritedMarks: readonly Mark[] = [],
): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  for (const node of content ?? []) {
    const marks = [...inheritedMarks, ...(node.marks ?? [])];
    if (node.type === 'text') {
      children.push(createRun(node, marks));
    } else if (node.type === 'hardBreak') {
      children.push(new TextRun({ break: 1 }));
    } else if (node.content) {
      children.push(...inlineChildren(node.content, marks));
    }
  }
  return children;
}

function plainText(node: JSONContent): string {
  if (node.type === 'text') {
    return node.text ?? '';
  }
  if (node.type === 'hardBreak') {
    return '\n';
  }
  return (node.content ?? []).map(plainText).join('');
}

function headingFor(node: JSONContent): Heading | undefined {
  if (node.type !== 'heading') {
    return undefined;
  }
  const level = Number(node.attrs?.['level'] ?? 1);
  if (!Number.isFinite(level)) {
    return undefined;
  }
  return HEADINGS[Math.min(LIST_LEVELS, Math.max(1, Math.round(level))) - 1];
}

function alignmentFor(
  node: JSONContent,
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (node.attrs?.['textAlign']) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    case 'left':
      return AlignmentType.LEFT;
    default:
      return undefined;
  }
}

function createParagraph(node: JSONContent, context: ParagraphContext = {}): Paragraph {
  const children = inlineChildren(node.content);
  let options: IParagraphOptions = children.length > 0 ? { children } : { text: '' };

  const heading = headingFor(node);
  if (heading) {
    options = { ...options, heading };
  }

  const alignment = alignmentFor(node);
  if (alignment) {
    options = { ...options, alignment };
  }

  if (context.list) {
    options =
      context.list.kind === 'bullet'
        ? { ...options, bullet: { level: context.list.level } }
        : {
            ...options,
            numbering: {
              reference: ORDERED_LIST_REFERENCE,
              level: context.list.level,
            },
          };
  }

  if (context.quote) {
    options = {
      ...options,
      indent: { left: 480 },
      border: {
        left: {
          style: BorderStyle.SINGLE,
          size: 12,
          color: 'C7D2FE',
          space: 12,
        },
      },
    };
  } else if (context.indentLeft) {
    options = { ...options, indent: { left: context.indentLeft } };
  }

  return new Paragraph(options);
}

function createCodeParagraph(node: JSONContent): Paragraph {
  const children: ParagraphChild[] = [];
  const lines = plainText(node).split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      children.push(new TextRun({ break: 1 }));
    }
    if (line) {
      children.push(new TextRun({ text: line, font: 'Consolas', size: 20 }));
    }
  });
  if (children.length === 0) {
    children.push(new TextRun({ text: '' }));
  }
  return new Paragraph({
    children,
    shading: { fill: 'F3F4F6' },
    spacing: { before: 120, after: 120 },
    indent: { left: 240, right: 240 },
  });
}

function createHorizontalRule(): Paragraph {
  return new Paragraph({
    text: '',
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: 'D1D5DB',
        space: 1,
      },
    },
    spacing: { before: 160, after: 160 },
  });
}

function convertList(node: JSONContent, level: number, quote: boolean): Paragraph[] {
  const kind = node.type === 'orderedList' ? 'ordered' : 'bullet';
  const paragraphs: Paragraph[] = [];

  for (const item of node.content ?? []) {
    let firstParagraph = true;
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        paragraphs.push(...convertList(child, Math.min(level + 1, LIST_LEVELS - 1), quote));
      } else if (child.type === 'paragraph') {
        paragraphs.push(
          createParagraph(child, {
            ...(firstParagraph ? { list: { kind, level } } : {}),
            ...(!firstParagraph ? { indentLeft: 720 * (level + 1) } : {}),
            quote,
          }),
        );
        firstParagraph = false;
      } else {
        paragraphs.push(...convertBlocks([child], level, quote));
      }
    }
  }

  return paragraphs;
}

function convertBlocks(
  content: readonly JSONContent[] | undefined,
  listLevel = 0,
  quote = false,
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const node of content ?? []) {
    switch (node.type) {
      case 'paragraph':
        paragraphs.push(createParagraph(node, { quote }));
        break;
      case 'heading':
        paragraphs.push(createParagraph(node, { quote }));
        break;
      case 'blockquote':
        paragraphs.push(...convertBlocks(node.content, listLevel, true));
        break;
      case 'bulletList':
      case 'orderedList':
        paragraphs.push(...convertList(node, listLevel, quote));
        break;
      case 'codeBlock':
        paragraphs.push(createCodeParagraph(node));
        break;
      case 'horizontalRule':
        paragraphs.push(createHorizontalRule());
        break;
      default:
        if (node.text) {
          paragraphs.push(
            new Paragraph({
              children: inlineChildren([node]),
            }),
          );
        } else if (node.content) {
          paragraphs.push(...convertBlocks(node.content, listLevel, quote));
        }
        break;
    }
  }
  return paragraphs;
}

function orderedListLevels() {
  return Array.from({ length: LIST_LEVELS }, (_, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: 720 + level * 360, hanging: 360 },
      },
    },
  }));
}

export function buildDocxDocument(title: string, content: JSONContent): Document {
  const paragraphs = convertBlocks(content.content);
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ text: '' }));
  }

  return new Document({
    title,
    creator: 'PaperLens',
    description: 'Exported from PaperLens.',
    styles: {
      default: {
        document: {
          run: { font: 'Georgia', size: 22 },
          paragraph: { spacing: { line: 276, after: 160 } },
        },
        heading1: {
          run: { font: 'Georgia', size: 36, bold: true, color: '1F2937' },
          paragraph: { spacing: { before: 320, after: 160 } },
        },
        heading2: {
          run: { font: 'Georgia', size: 30, bold: true, color: '1F2937' },
          paragraph: { spacing: { before: 280, after: 140 } },
        },
        heading3: {
          run: { font: 'Georgia', size: 26, bold: true, color: '1F2937' },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        hyperlink: {
          run: { color: '1155CC', underline: { type: UnderlineType.SINGLE } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REFERENCE,
          levels: orderedListLevels(),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children: paragraphs,
      },
    ],
  });
}

export async function createDocxBlob(title: string, content: JSONContent): Promise<Blob> {
  return Packer.toBlob(buildDocxDocument(title, content));
}
