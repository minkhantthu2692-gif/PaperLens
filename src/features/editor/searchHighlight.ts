import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { SearchMatch } from './search';

export interface SearchHighlightPayload {
  matches: SearchMatch[];
  activeIndex: number;
}

export interface SearchHighlightClasses {
  match: string;
  active: string;
}

export const searchHighlightKey = new PluginKey<DecorationSet>('paperlensSearchHighlight');

function buildDecorations(
  doc: ProseMirrorNode,
  classes: SearchHighlightClasses,
  payload: SearchHighlightPayload,
): DecorationSet {
  const decorations = payload.matches
    .filter((match) => match.to > match.from)
    .map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class: index === payload.activeIndex ? `${classes.match} ${classes.active}` : classes.match,
      }),
    );

  return DecorationSet.create(doc, decorations);
}

/**
 * Highlights every search hit and the active hit without changing the document
 * text, marks, or selection. Decorations are mapped through edits so the
 * highlights stay correct when the user types or replaces text.
 */
export function createSearchHighlightExtension(classes: SearchHighlightClasses) {
  return Extension.create({
    name: 'searchHighlight',
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: searchHighlightKey,
          state: {
            init: () => DecorationSet.empty,
            apply(transaction, previous) {
              const payload = transaction.getMeta(searchHighlightKey) as
                SearchHighlightPayload | undefined;
              if (payload) {
                return buildDecorations(transaction.doc, classes, payload);
              }
              if (transaction.docChanged) {
                return previous.map(transaction.mapping, transaction.doc);
              }
              return previous;
            },
          },
          props: {
            decorations(state) {
              return searchHighlightKey.getState(state) ?? DecorationSet.empty;
            },
          },
        }),
      ];
    },
  });
}

/** Pushes the current match list into the editor's decoration plugin. */
export function applySearchHighlights(editor: Editor, payload: SearchHighlightPayload): void {
  editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, payload));
}

/** Removes all search highlights from the editor. */
export function clearSearchHighlights(editor: Editor): void {
  applySearchHighlights(editor, { matches: [], activeIndex: -1 });
}
