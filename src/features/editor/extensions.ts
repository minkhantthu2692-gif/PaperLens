import Link from '@tiptap/extension-link';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { PARAGRAPH_ALIGNMENTS } from '@/domain/paragraphAlignment';
import {
  createSearchHighlightExtension,
  type SearchHighlightClasses,
} from '@/features/editor/searchHighlight';

interface EditorExtensionOptions {
  searchHighlight?: SearchHighlightClasses;
}

export function createEditorExtensions(placeholder: string, options: EditorExtensionOptions = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ['http', 'https', 'mailto', 'tel'],
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: [...PARAGRAPH_ALIGNMENTS],
      defaultAlignment: 'left',
    }),
    Placeholder.configure({ placeholder }),
    ...(options.searchHighlight ? [createSearchHighlightExtension(options.searchHighlight)] : []),
  ];
}
