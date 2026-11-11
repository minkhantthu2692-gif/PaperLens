import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import {
  AlignJustify,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  PenLine,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import formStyles from '@/components/ui/Form.module.css';
import type { EditorContent as EditorSnapshot } from '@/domain/document';
import { getParagraphAlignment, type ParagraphAlignment } from '@/domain/paragraphAlignment';
import { countWords, normalizeLinkHref } from '@/lib/format';
import { saveEditorContent } from '@/services/storage/documents';
import { createEditorExtensions } from '@/features/editor/extensions';
import styles from './EditorPanel.module.css';

export type SaveState = 'saved' | 'saving' | 'error';

export interface EditorSelectionContext {
  text: string;
  from: number;
  to: number;
}

interface EditorPanelProps {
  documentId: string;
  initialContent: EditorSnapshot;
  fullWorkspace?: boolean;
  onEditorReady: (editor: Editor | null) => void;
  onSaveStateChange: (state: SaveState) => void;
  onAiRequest: (selection: EditorSelectionContext) => void;
  headerActions?: ReactNode;
  panelTitle?: ReactNode;
}

interface AiBubblePosition {
  top: number;
  left: number;
  text: string;
  from: number;
  to: number;
}

function createSnapshot(editor: Editor): EditorSnapshot {
  return {
    html: editor.getHTML(),
    text: editor.getText({ blockSeparator: '\n\n' }),
    json: editor.getJSON() as Record<string, unknown>,
  };
}

export function EditorPanel({
  documentId,
  initialContent,
  fullWorkspace = false,
  onEditorReady,
  onSaveStateChange,
  onAiRequest,
  headerActions,
  panelTitle,
}: EditorPanelProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ words: 0, characters: 0 });
  const [aiBubble, setAiBubble] = useState<AiBubblePosition | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingRef = useRef<EditorSnapshot | null>(null);
  const unsavedRef = useRef(false);
  const onSaveStateRef = useRef(onSaveStateChange);
  onSaveStateRef.current = onSaveStateChange;

  const extensions = useRef(createEditorExtensions(t('editor.placeholder'))).current;

  const flush = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    pendingRef.current = null;
    onSaveStateRef.current('saving');
    try {
      await saveEditorContent(documentId, pending);
      if (!pendingRef.current) {
        unsavedRef.current = false;
        onSaveStateRef.current('saved');
      }
    } catch {
      pendingRef.current ??= pending;
      unsavedRef.current = true;
      onSaveStateRef.current('error');
    }
  }, [documentId]);

  const editor = useEditor({
    extensions,
    content: initialContent.json ?? initialContent.html ?? '',
    editorProps: {
      attributes: {
        class: styles.prose ?? '',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: current }) => {
      const snapshot = createSnapshot(current);
      pendingRef.current = snapshot;
      unsavedRef.current = true;
      const text = snapshot.text;
      setStats({ words: countWords(text), characters: text.length });
      onSaveStateRef.current('saving');
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => void flush(), 600);
    },
  });

  useEffect(() => {
    onEditorReady(editor ?? null);
    if (editor) {
      const text = editor.getText({ blockSeparator: '\n\n' });
      setStats({ words: countWords(text), characters: text.length });
    }
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) {
      setAiBubble(null);
      return;
    }

    const update = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || !editor.isEditable) {
        setAiBubble(null);
        return;
      }
      const text = editor.state.doc.textBetween(from, to, '\n\n');
      if (!text.trim()) {
        setAiBubble(null);
        return;
      }
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const top = Math.min(start.top, end.top);
      const bottom = Math.max(start.bottom, end.bottom);
      const preferredTop = top > 56 ? top - 44 : bottom + 8;
      const preferredLeft = Math.min(start.left, end.left);
      setAiBubble({
        top: Math.max(8, preferredTop),
        left: Math.max(8, Math.min(preferredLeft, window.innerWidth - 190)),
        text,
        from,
        to,
      });
    };

    editor.on('selectionUpdate', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    update();

    return () => {
      editor.off('selectionUpdate', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      setAiBubble(null);
    };
  }, [editor]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsavedRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimerRef.current);
      const pending = pendingRef.current;
      if (pending) {
        void saveEditorContent(documentId, pending).catch(() => undefined);
      }
    };
  }, [documentId]);

  if (!editor) {
    return null;
  }

  const headingValue = editor.isActive('heading', { level: 1 })
    ? '1'
    : editor.isActive('heading', { level: 2 })
      ? '2'
      : editor.isActive('heading', { level: 3 })
        ? '3'
        : 'paragraph';

  const linkActive = editor.isActive('link');
  const canEditLink = linkActive || !editor.state.selection.empty;
  const alignmentNode = editor.isActive('heading') ? 'heading' : 'paragraph';
  const currentAlignment = getParagraphAlignment(editor.getAttributes(alignmentNode).textAlign);
  const alignmentIsActive = (alignment: ParagraphAlignment) => currentAlignment === alignment;

  const openLinkDialog = () => {
    setLinkUrl(editor.getAttributes('link').href ?? '');
    setLinkError(null);
    setLinkDialogOpen(true);
  };

  const applyLink = () => {
    const href = normalizeLinkHref(linkUrl);
    if (!href) {
      setLinkError(t('editor.linkInvalid'));
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkDialogOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkDialogOpen(false);
  };

  return (
    <section
      className={`${styles.shell} ${fullWorkspace ? styles.fullWorkspace : ''}`}
      aria-label={t('workspace.editor')}
    >
      <header className={styles.panelHeader}>
        <div className={styles.headerTitle}>
          <PenLine size={16} aria-hidden="true" />
          {panelTitle ?? <span>{t('workspace.editor')}</span>}
        </div>
        {headerActions ? (
          <div
            className={styles.headerActions}
            role="group"
            aria-label={t('workspace.editorActions')}
          >
            {headerActions}
          </div>
        ) : null}
      </header>

      <div
        className={`${styles.toolbar} ${fullWorkspace ? styles.fullWorkspaceToolbar : ''}`}
        role="toolbar"
        aria-label={t('editor.label')}
      >
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          aria-label={t('editor.undo')}
          title={t('editor.undo')}
        >
          <Undo2 size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          aria-label={t('editor.redo')}
          title={t('editor.redo')}
        >
          <Redo2 size={16} aria-hidden="true" />
        </Button>

        <span className={styles.divider} aria-hidden="true" />

        <select
          className={styles.select}
          value={headingValue}
          aria-label={t('editor.paragraph')}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'paragraph') {
              editor.chain().focus().setParagraph().run();
            } else {
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(value) as 1 | 2 | 3 })
                .run();
            }
          }}
        >
          <option value="paragraph">{t('editor.paragraph')}</option>
          <option value="1">{t('editor.heading1')}</option>
          <option value="2">{t('editor.heading2')}</option>
          <option value="3">{t('editor.heading3')}</option>
        </select>

        <span className={styles.divider} aria-hidden="true" />

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={editor.isActive('bold') ? styles.active : undefined}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label={t('editor.bold')}
          title={t('editor.bold')}
          aria-pressed={editor.isActive('bold')}
        >
          <Bold size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={editor.isActive('italic') ? styles.active : undefined}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label={t('editor.italic')}
          title={t('editor.italic')}
          aria-pressed={editor.isActive('italic')}
        >
          <Italic size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={editor.isActive('underline') ? styles.active : undefined}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label={t('editor.underline')}
          title={t('editor.underline')}
          aria-pressed={editor.isActive('underline')}
        >
          <UnderlineIcon size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={editor.isActive('strike') ? styles.active : undefined}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label={t('editor.strike')}
          title={t('editor.strike')}
          aria-pressed={editor.isActive('strike')}
        >
          <Strikethrough size={16} aria-hidden="true" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={linkActive ? styles.active : undefined}
          onClick={openLinkDialog}
          disabled={!canEditLink}
          aria-label={linkActive ? t('editor.linkEdit') : t('editor.linkAdd')}
          title={linkActive ? t('editor.linkEdit') : t('editor.linkAdd')}
          aria-pressed={linkActive}
        >
          <Link2 size={16} aria-hidden="true" />
        </Button>

        <span className={styles.divider} aria-hidden="true" />

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={editor.isActive('bulletList') ? styles.active : undefined}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label={t('editor.bulletList')}
          title={t('editor.bulletList')}
          aria-pressed={editor.isActive('bulletList')}
        >
          <List size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={editor.isActive('orderedList') ? styles.active : undefined}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label={t('editor.orderedList')}
          title={t('editor.orderedList')}
          aria-pressed={editor.isActive('orderedList')}
        >
          <ListOrdered size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={editor.isActive('blockquote') ? styles.active : undefined}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label={t('editor.blockquote')}
          title={t('editor.blockquote')}
          aria-pressed={editor.isActive('blockquote')}
        >
          <Quote size={16} aria-hidden="true" />
        </Button>

        <span className={styles.divider} aria-hidden="true" />

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={alignmentIsActive('left') ? styles.active : undefined}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          aria-label={t('editor.alignLeft')}
          title={t('editor.alignLeft')}
          aria-pressed={alignmentIsActive('left')}
        >
          <AlignLeft size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={alignmentIsActive('center') ? styles.active : undefined}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          aria-label={t('editor.alignCenter')}
          title={t('editor.alignCenter')}
          aria-pressed={alignmentIsActive('center')}
        >
          <AlignCenter size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={alignmentIsActive('right') ? styles.active : undefined}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          aria-label={t('editor.alignRight')}
          title={t('editor.alignRight')}
          aria-pressed={alignmentIsActive('right')}
        >
          <AlignRight size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={alignmentIsActive('justify') ? styles.active : undefined}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          aria-label={t('editor.alignJustify')}
          title={t('editor.alignJustify')}
          aria-pressed={alignmentIsActive('justify')}
        >
          <AlignJustify size={16} aria-hidden="true" />
        </Button>
      </div>

      <div className={styles.scroll}>
        <div className={styles.paper}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <footer className={styles.footer}>
        <span>{t('editor.words', { count: stats.words })}</span>
        <span>{t('editor.characters', { count: stats.characters })}</span>
      </footer>

      <Dialog
        open={linkDialogOpen}
        title={linkActive ? t('editor.linkEdit') : t('editor.linkAdd')}
        description={t('editor.linkHint')}
        onClose={() => setLinkDialogOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLinkDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            {linkActive ? (
              <Button variant="ghost" onClick={removeLink}>
                {t('editor.linkRemove')}
              </Button>
            ) : null}
            <Button variant="primary" onClick={applyLink}>
              {t('editor.linkApply')}
            </Button>
          </>
        }
      >
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="editor-link-url">
            {t('editor.linkUrl')}
          </label>
          <input
            id="editor-link-url"
            className={formStyles.input}
            value={linkUrl}
            onChange={(event) => {
              setLinkUrl(event.target.value);
              setLinkError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
            }}
          />
          {linkError ? (
            <p className={formStyles.alert} role="alert">
              {linkError}
            </p>
          ) : null}
        </div>
      </Dialog>

      {aiBubble ? (
        <button
          type="button"
          className={styles.aiBubble}
          style={{ top: aiBubble.top, left: aiBubble.left }}
          aria-label={t('editor.aiHint')}
          title={t('editor.aiHint')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const selection = { text: aiBubble.text, from: aiBubble.from, to: aiBubble.to };
            setAiBubble(null);
            onAiRequest(selection);
          }}
        >
          <Sparkles size={14} aria-hidden="true" />
          {t('editor.aiAction')}
        </button>
      ) : null}
    </section>
  );
}
