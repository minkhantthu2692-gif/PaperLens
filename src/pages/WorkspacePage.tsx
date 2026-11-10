import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  AlertCircle,
  ChevronDown,
  Download,
  FileText,
  FileType2,
  Printer,
  SearchX,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import type { DocumentRecord, SourceAsset } from '@/domain/document';
import { EditorPanel, type SaveState } from '@/features/workspace/EditorPanel';
import { SourcePanel } from '@/features/workspace/SourcePanel';
import { exportHtml, exportPlainText, printDocument } from '@/services/export/exportDocument';
import {
  getDocument,
  getSourceAsset,
  renameDocument,
  updateDocumentSourcePageCount,
} from '@/services/storage/documents';
import styles from './WorkspacePage.module.css';

const SPLIT_STORAGE_KEY = 'paperlens.workspace.split';
const MIN_SPLIT = 30;
const MAX_SPLIT = 70;
const SPLITTER_STEP = 2;

function clampSplit(value: number): number {
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));
}

function readSplit(): number {
  try {
    const stored = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= MIN_SPLIT && stored <= MAX_SPLIT) {
      return stored;
    }
  } catch {
    // Fall back to the default split.
  }
  return 50;
}

type ExportFormat = 'txt' | 'html' | 'pdf';

export default function WorkspacePage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [asset, setAsset] = useState<SourceAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [split, setSplit] = useState(readSplit);
  const [mobilePanel, setMobilePanel] = useState<'source' | 'editor'>('editor');
  const editorRef = useRef<Editor | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const splitRef = useRef(split);
  splitRef.current = split;
  const translationRef = useRef(t);
  translationRef.current = t;

  useEffect(() => {
    let cancelled = false;
    if (!documentId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setNotFound(false);
    void (async () => {
      try {
        const record = await getDocument(documentId);
        if (!record) {
          if (!cancelled) {
            setNotFound(true);
            setLoading(false);
          }
          return;
        }
        const sourceAsset = await getSourceAsset(record.source.assetId);
        if (cancelled) {
          return;
        }
        setDocument(record);
        setTitle(record.title);
        setAsset(sourceAsset ?? null);
        setLoading(false);
        if (!sourceAsset) {
          setError(translationRef.current('workspace.sourceError'));
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!exportOpen) {
      return;
    }
    const handlePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportOpen(false);
      }
    };
    window.document.addEventListener('pointerdown', handlePointer);
    window.document.addEventListener('keydown', handleKey);
    return () => {
      window.document.removeEventListener('pointerdown', handlePointer);
      window.document.removeEventListener('keydown', handleKey);
    };
  }, [exportOpen]);

  const handleEditorReady = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
  }, []);

  const handleSaveStateChange = useCallback((state: SaveState) => {
    setSaveState(state);
  }, []);

  const handlePageCount = useCallback(
    (count: number) => {
      setDocument((current) =>
        current ? { ...current, source: { ...current.source, pageCount: count } } : current,
      );
      if (documentId) {
        void updateDocumentSourcePageCount(documentId, count).catch(() => undefined);
      }
    },
    [documentId],
  );

  const handleInsertText = useCallback(
    (text: string) => {
      const editor = editorRef.current;
      const blocks = text
        .split(/\n\s*\n+/)
        .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean);
      if (!editor || blocks.length === 0) {
        return;
      }
      const paragraphs = blocks.map((block) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: block }],
      }));
      editor
        .chain()
        .focus('end')
        .insertContent(editor.isEmpty ? paragraphs : [{ type: 'paragraph' }, ...paragraphs])
        .run();
      setNotice(t('workspace.inserted'));
    },
    [t],
  );

  const commitTitle = async () => {
    if (!document) {
      return;
    }
    const next = title.trim().slice(0, 120);
    if (!next) {
      setTitle(document.title);
      return;
    }
    if (next === document.title) {
      return;
    }
    try {
      await renameDocument(document.id, next);
      setDocument({ ...document, title: next });
      setTitle(next);
    } catch {
      setTitle(document.title);
      setError(t('library.renameError'));
    }
  };

  const handleExport = (format: ExportFormat) => {
    setExportOpen(false);
    const editor = editorRef.current;
    if (!editor || !document) {
      return;
    }
    setError(null);
    try {
      const html = editor.getHTML();
      if (format === 'txt') {
        exportPlainText(document.title, editor.getText({ blockSeparator: '\n\n' }));
      } else if (format === 'html') {
        exportHtml(document.title, html);
      } else {
        printDocument(document.title, html);
      }
    } catch {
      setError(t('workspace.exportError'));
    }
  };

  const persistSplit = (value: number) => {
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(value));
    } catch {
      // The chosen split still applies for this session.
    }
  };

  const handleSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleSplitterPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    const bounds = panelsRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) {
      return;
    }
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setSplit(clampSplit(next));
  };

  const handleSplitterPointerUp = () => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    persistSplit(clampSplit(splitRef.current));
  };

  const handleSplitterKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? SPLITTER_STEP * 5 : SPLITTER_STEP;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') {
      next = split - step;
    } else if (event.key === 'ArrowRight') {
      next = split + step;
    } else if (event.key === 'Home') {
      next = MIN_SPLIT;
    } else if (event.key === 'End') {
      next = MAX_SPLIT;
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    const clamped = clampSplit(next);
    setSplit(clamped);
    persistSplit(clamped);
  };

  if (loading) {
    return (
      <div className={styles.statePage} role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (notFound || !document) {
    return (
      <div className={styles.statePage}>
        <span className={styles.stateIcon}>
          <SearchX size={26} aria-hidden="true" />
        </span>
        <h1>{t('workspace.notFoundTitle')}</h1>
        <p>{t('workspace.notFoundDescription')}</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          {t('workspace.backToDocuments')}
        </Button>
      </div>
    );
  }

  const saveLabel =
    saveState === 'error'
      ? t('workspace.saveError')
      : saveState === 'saving'
        ? t('workspace.saving')
        : t('workspace.saved');

  return (
    <div className={styles.page}>
      <TopBar
        onBack={() => navigate('/')}
        backLabel={t('workspace.backToDocuments')}
        title={
          <input
            className={styles.titleInput}
            value={title}
            maxLength={120}
            aria-label={t('workspace.titleLabel')}
            title={t('workspace.titleLabel')}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                setTitle(document.title);
                event.currentTarget.blur();
              }
            }}
          />
        }
        subtitle={saveLabel}
        actions={
          <div className={styles.exportWrap} ref={menuRef}>
            <Button
              variant="primary"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((value) => !value)}
            >
              <Download size={16} aria-hidden="true" />
              {t('workspace.export')}
              <ChevronDown size={14} aria-hidden="true" />
            </Button>
            {exportOpen ? (
              <div className={styles.menu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => handleExport('txt')}
                >
                  <FileText size={16} aria-hidden="true" />
                  {t('workspace.exportTxt')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => handleExport('html')}
                >
                  <FileType2 size={16} aria-hidden="true" />
                  {t('workspace.exportHtml')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => handleExport('pdf')}
                >
                  <Printer size={16} aria-hidden="true" />
                  {t('workspace.exportPdf')}
                </button>
              </div>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className={styles.errorBanner} role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setError(null)}
            aria-label={t('common.dismiss')}
            title={t('common.dismiss')}
          >
            <X size={15} aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <div className={styles.mobileTabs} role="tablist" aria-label={t('workspace.source')}>
        <button
          type="button"
          role="tab"
          className={clsx(styles.mobileTab, mobilePanel === 'source' && styles.mobileTabActive)}
          aria-selected={mobilePanel === 'source'}
          onClick={() => setMobilePanel('source')}
        >
          {t('workspace.showSource')}
        </button>
        <button
          type="button"
          role="tab"
          className={clsx(styles.mobileTab, mobilePanel === 'editor' && styles.mobileTabActive)}
          aria-selected={mobilePanel === 'editor'}
          onClick={() => setMobilePanel('editor')}
        >
          {t('workspace.showEditor')}
        </button>
      </div>

      <div
        ref={panelsRef}
        className={styles.panels}
        style={{ '--split': `${split}%` } as CSSProperties}
      >
        <div className={clsx(styles.panel, mobilePanel !== 'source' && styles.mobileHidden)}>
          {asset ? (
            <SourcePanel
              asset={asset}
              {...(document.source.pageCount !== undefined
                ? { pageCount: document.source.pageCount }
                : {})}
              onPageCount={handlePageCount}
              onInsertText={handleInsertText}
            />
          ) : (
            <p className={styles.panelFallback}>{t('workspace.sourceError')}</p>
          )}
        </div>

        <div
          className={styles.splitter}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('workspace.splitter')}
          aria-valuemin={MIN_SPLIT}
          aria-valuemax={MAX_SPLIT}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onPointerDown={handleSplitterPointerDown}
          onPointerMove={handleSplitterPointerMove}
          onPointerUp={handleSplitterPointerUp}
          onPointerCancel={handleSplitterPointerUp}
          onKeyDown={handleSplitterKeyDown}
          onDoubleClick={() => {
            setSplit(50);
            persistSplit(50);
          }}
        />

        <div className={clsx(styles.panel, mobilePanel !== 'editor' && styles.mobileHidden)}>
          <EditorPanel
            key={document.id}
            documentId={document.id}
            initialContent={document.editor}
            onEditorReady={handleEditorReady}
            onSaveStateChange={handleSaveStateChange}
          />
        </div>
      </div>

      {notice ? (
        <p className={styles.toast} role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
