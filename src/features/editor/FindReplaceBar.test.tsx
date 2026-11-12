import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import type { EditorContent } from '@/domain/document';
import { EditorPanel } from '@/features/workspace/EditorPanel';

function htmlContent(html: string): EditorContent {
  return { html, text: '', json: null };
}

function renderEditor(html: string) {
  let editor: Editor | null = null;
  const utils = render(
    <EditorPanel
      documentId="find-replace-test"
      initialContent={htmlContent(html)}
      onEditorReady={(readyEditor) => {
        editor = readyEditor;
      }}
      onSaveStateChange={() => undefined}
      onAiRequest={() => undefined}
    />,
  );
  return { ...utils, getEditor: () => editor };
}

function findInput() {
  return screen.getByRole('textbox', { name: 'Find in document' });
}

function activeHighlight() {
  return document.querySelector<HTMLElement>('[class*="_searchMatchActive"]');
}

async function openFind(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Find in document' }));
  await screen.findByRole('search', { name: 'Find and replace' });
}

function editorText() {
  return document.querySelector('.ProseMirror')?.textContent ?? '';
}

function panel() {
  return screen.getByRole('region', { name: 'Editor' });
}

async function setupEditor(html: string) {
  const view = renderEditor(html);
  const user = userEvent.setup();
  await waitFor(() => expect(view.getEditor()).not.toBeNull());
  return { ...view, user };
}

beforeEach(async () => {
  // jsdom implements <dialog> without the modal methods; the Dialog component
  // falls back for showModal but still relies on close().
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  await i18n.changeLanguage('en');
});

describe('Editor find and replace', () => {
  it('highlights every match, marks the active match, and navigates with wrapping', async () => {
    const { user } = await setupEditor('<p>Apple apple pineapple</p>');
    await openFind(user);

    await user.type(findInput(), 'apple');

    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(document.querySelectorAll('[class*="_searchMatch_"]')).toHaveLength(3);
    expect(activeHighlight()?.textContent).toBe('Apple');

    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(activeHighlight()?.textContent).toBe('apple');

    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('3 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
  });

  it('keeps case and whole-word options in sync with the match count', async () => {
    const { user } = await setupEditor('<p>Apple apple pineapple</p><p>cat category cat</p>');
    await openFind(user);

    await user.type(findInput(), 'apple');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Match case' }));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    await user.clear(findInput());
    await user.type(findInput(), 'cat');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Whole word' }));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('searches only the selected text when that option is enabled', async () => {
    const { getEditor, user } = await setupEditor('<p>alpha beta alpha</p><p>alpha</p>');
    const editor = getEditor();
    if (!editor) {
      throw new Error('Editor did not initialize');
    }
    // jsdom has no layout engine, so ProseMirror cannot measure coordinates.
    editor.view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });

    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 17 });
    });

    await openFind(user);
    const selectedOption = screen.getByRole('checkbox', { name: 'Selected text only' });
    expect(selectedOption).toBeEnabled();

    await user.type(findInput(), 'alpha');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    await user.click(selectedOption);
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    await user.click(selectedOption);
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('disables selection search when the editor has no selection', async () => {
    const { user } = await setupEditor('<p>cat cat cat</p>');
    await openFind(user);

    expect(screen.getByRole('checkbox', { name: 'Selected text only' })).toBeDisabled();
    await user.type(findInput(), 'cat');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('replaces the current match and replaces all through a confirmation dialog', async () => {
    const { user, getEditor } = await setupEditor('<p>cat cat cat</p>');
    const editor = getEditor();
    if (!editor) {
      throw new Error('Editor did not initialize');
    }
    fireEvent.keyDown(panel(), { key: 'h', ctrlKey: true });

    await screen.findByRole('search', { name: 'Find and replace' });
    expect(screen.getByRole('textbox', { name: 'Replace with' })).toBeInTheDocument();

    await user.type(findInput(), 'cat');
    await user.type(screen.getByRole('textbox', { name: 'Replace with' }), 'dog');
    await user.click(screen.getByRole('button', { name: 'Replace' }));

    await waitFor(() => expect(editorText()).toBe('dog cat cat'));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Replace all' }));
    const dialog = screen.getByRole('dialog', { name: 'Replace all matches?' });
    expect(dialog).toHaveTextContent('Replace 2 matches?');
    await user.click(within(dialog).getByRole('button', { name: 'Replace all' }));

    await waitFor(() => expect(editorText()).toBe('dog dog dog'));
    expect(screen.getByText('No results')).toBeInTheDocument();

    // Undo restores the whole replace-all in a single step...
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(editorText()).toBe('dog cat cat'));
    // ...and the earlier single replacement is its own undo step.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(editorText()).toBe('cat cat cat'));
  });

  it('opens with Ctrl+F, expands replace with Ctrl+H, and closes with Escape', async () => {
    const { user } = await setupEditor('<p>cat cat cat</p>');

    fireEvent.keyDown(panel(), { key: 'f', ctrlKey: true });
    expect(screen.getByRole('search', { name: 'Find and replace' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Replace with' })).not.toBeInTheDocument();

    fireEvent.keyDown(panel(), { key: 'h', ctrlKey: true });
    expect(screen.getByRole('textbox', { name: 'Replace with' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('search', { name: 'Find and replace' })).not.toBeInTheDocument(),
    );
  });

  it('handles empty queries and zero-result searches safely', async () => {
    const { user } = await setupEditor('<p>cat cat cat</p>');
    await openFind(user);

    expect(screen.getByText('Type to search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous match' })).toBeDisabled();

    await user.type(findInput(), 'zebra');
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(document.querySelectorAll('[class*="_searchMatch_"]')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Toggle replace controls' }));
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
  });

  it('clears the query and closes the panel from its controls', async () => {
    const { user } = await setupEditor('<p>cat cat cat</p>');
    await openFind(user);

    await user.type(findInput(), 'cat');
    expect(document.querySelectorAll('[class*="_searchMatch_"]')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(findInput()).toHaveValue('');
    expect(document.querySelectorAll('[class*="_searchMatch_"]')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByRole('search', { name: 'Find and replace' })).not.toBeInTheDocument();
  });
});
