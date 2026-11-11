import type { JSONContent } from '@tiptap/react';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDocxBlob } from './docxExport';

const content: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Quarterly report' }],
    },
    {
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Bold' },
        { type: 'text', text: ' and ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'italic' },
        { type: 'text', text: ' with ' },
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/report' } }],
          text: 'a link',
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First bullet' }],
            },
          ],
        },
      ],
    },
    {
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First numbered item' }],
            },
          ],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Quoted passage' }],
        },
      ],
    },
    {
      type: 'codeBlock',
      content: [{ type: 'text', text: 'const count = 2;\nconsole.log(count);' }],
    },
    { type: 'horizontalRule' },
  ],
};

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read DOCX blob'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

async function unpack(blob: Blob) {
  const files = unzipSync(new Uint8Array(await readBlob(blob)));
  const documentXml = files['word/document.xml'];
  if (!documentXml) {
    throw new Error('Missing word/document.xml');
  }
  const relationships = files['word/_rels/document.xml.rels'];
  return {
    documentXml: strFromU8(documentXml),
    relationships: relationships ? strFromU8(relationships) : '',
  };
}

describe('DOCX export', () => {
  it('packages formatted editor content into a valid DOCX archive', async () => {
    const blob = await createDocxBlob('Quarterly report', content);
    const { documentXml, relationships } = await unpack(blob);

    expect(blob.size).toBeGreaterThan(1000);
    expect(documentXml).toContain('Quarterly report');
    expect(documentXml).toContain('First bullet');
    expect(documentXml).toContain('First numbered item');
    expect(documentXml).toContain('Quoted passage');
    expect(documentXml).toContain('const count = 2;');
    expect(documentXml).toContain('console.log(count);');
    expect(documentXml).toContain('<w:numPr>');
    expect(documentXml).toContain('<w:b/>');
    expect(documentXml).toContain('<w:i/>');
    expect(relationships).toContain('https://example.com/report');
  });

  it('renders unsafe link protocols as plain text', async () => {
    const unsafe: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              text: 'unsafe link',
            },
          ],
        },
      ],
    };

    const blob = await createDocxBlob('Unsafe', unsafe);
    const { documentXml, relationships } = await unpack(blob);

    expect(documentXml).toContain('unsafe link');
    expect(documentXml).not.toContain('javascript:alert');
    expect(relationships).not.toContain('javascript:alert');
  });
});
