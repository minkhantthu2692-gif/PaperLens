import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import type { EditorContent } from '@/domain/document';
import { EditorPanel } from './EditorPanel';

const initialContent: EditorContent = {
  html: '<p>First paragraph</p><p>Second paragraph</p>',
  text: 'First paragraph\n\nSecond paragraph',
  json: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
    ],
  },
};

function renderEditor(
  onEditor: (editor: Editor | null) => void = () => undefined,
  content: EditorContent = initialContent,
) {
  return render(
    <EditorPanel
      documentId="alignment-test"
      initialContent={content}
      onEditorReady={onEditor}
      onSaveStateChange={() => undefined}
      onAiRequest={() => undefined}
    />,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('Editor paragraph alignment', () => {
  it('offers four alignments and aligns the current paragraph', async () => {
    const user = userEvent.setup();
    renderEditor();

    const leftButton = screen.getByRole('button', { name: 'Align left' });
    expect(leftButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Align center' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Align right' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Justify' }));

    expect(screen.getByText('First paragraph').closest('p')).toHaveStyle({
      textAlign: 'justify',
    });
    expect(screen.getByRole('button', { name: 'Justify' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies alignment to all selected paragraphs', async () => {
    const user = userEvent.setup();
    let editor: Editor | null = null;
    renderEditor((readyEditor) => {
      editor = readyEditor;
    });

    await waitFor(() => expect(editor).not.toBeNull());
    act(() => {
      editor?.commands.selectAll();
    });
    await user.click(screen.getByRole('button', { name: 'Align center' }));

    expect(screen.getByText('First paragraph').closest('p')).toHaveStyle({
      textAlign: 'center',
    });
    expect(screen.getByText('Second paragraph').closest('p')).toHaveStyle({
      textAlign: 'center',
    });
    expect(screen.getByRole('button', { name: 'Align center' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores existing heading alignment from saved editor content', () => {
    renderEditor(() => undefined, {
      ...initialContent,
      json: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2, textAlign: 'right' },
            content: [{ type: 'text', text: 'Saved heading' }],
          },
        ],
      },
    });

    expect(screen.getByText('Saved heading').closest('h2')).toHaveStyle({ textAlign: 'right' });
    expect(screen.getByRole('button', { name: 'Align right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
