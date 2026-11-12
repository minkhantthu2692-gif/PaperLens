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
  Download,
  Eraser,
  Focus,
  FileText,
  FileType,
  FileType2,
  Languages,
  Printer,
  SearchX,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { FocusModeExitControl } from '@/components/layout/FocusModeExitControl';
import { useFocusMode } from '@/components/layout/FocusModeContext';
import { Button } from '@/components/ui/Button';
import type { DocumentRecord, SourceAsset } from '@/domain/document';
import { AiAssistantDialog } from '@/features/ai/AiAssistantDialog';
import { ImageRefineDialog, type RefinedImageResult } from '@/features/image/ImageRefineDialog';
import { TranslatorDialog } from '@/features/translator/TranslatorDialog';
import { CleanupDialog, type CleanupScope } from '@/features/editor/CleanupDialog';
import { OcrDialog, type OcrTarget } from '@/features/ocr/OcrDialog';
import {
  EditorPanel,
  type EditorSelectionContext,
  type SaveState,
} from '@/features/workspace/EditorPanel';
import { SourcePanel } from '@/features/workspace/SourcePanel';
import {
  exportDocx,
  exportHtml,
  exportPlainText,
  printDocument,
} from '@/services/export/exportDocument';
import { textToHtmlParagraphs } from '@/services/text/cleanup';
import { sanitizeFileName } from '@/lib/file';
import {
  clearRefinedImage,
  getDocument,
  getSourceAsset,
  renameDocument,
  saveRefinedImage,
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

type ExportFormat = 'txt' | 'html' | 'docx' | 'pdf';

export default function WorkspacePage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isFocusMode, setFocusMode, fullWorkspaceEnabled, fullscreenError, clearFullscreenError } =
    useFocusMode();
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [asset, setAsset] = useState<SourceAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [split, setSplit] = useState(readSplit);
  const [mobilePanel, setMobilePanel] = useState<'source' | 'editor'>('editor');
  const [ocrTarget, setOcrTarget] = useState<OcrTarget | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refinedAsset, setRefinedAsset] = useState<SourceAsset | null>(null);
  const [cleanupSource, setCleanupSource] = useState<{
    text: string;
    scope: CleanupScope;
    from: number;
    to: number;
  } | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [aiContext, setAiContext] = useState<{
    text: string;
    selection: EditorSelectionContext | null;
  } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [translatorOpen, setTranslatorOpen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const focusToggleRef = useRef<HTMLButtonElement>(null);
  const wasFocusModeRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const splitRef = useRef(split);
  splitRef.current = split;
  const translationRef = useRef(t);
  translationRef.current = t;

  useEffect(() => {
    if (wasFocusModeRef.current && !isFocusMode) {
      focusToggleRef.current?.focus();
    }
    wasFocusModeRef.current = isFocusMode;
  }, [isFocusMode]);

  useEffect(() => {
    // Document-scoped dialogs must not carry over when switching documents.
    setRefineOpen(false);
    setOcrTarget(null);
  }, [documentId]);

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
        const refined = record.source.refined
          ? await getSourceAsset(record.source.refined.assetId)
          : undefined;
        if (cancelled) {
          return;
        }
        setDocument(record);
        setTitle(record.title);
        setAsset(sourceAsset ?? null);
        setRefinedAsset(refined ?? null);
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
    setEditorReady(editor !== null);
  }, []);

  const handleOpenCleanup = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const { from, to, empty } = editor.state.selection;
    const text = empty
      ? editor.getText({ blockSeparator: '\n\n' })
      : editor.state.doc.textBetween(from, to, '\n\n');
    setCleanupSource({ text, scope: empty ? 'document' : 'selection', from, to });
    setCleanupOpen(true);
  }, []);

  const handleApplyCleanup = useCallback(
    (cleaned: string) => {
      const editor = editorRef.current;
      if (!editor || !cleanupSource) {
        return;
      }
      const html = textToHtmlParagraphs(cleaned);
      if (cleanupSource.scope === 'selection') {
        editor
          .chain()
          .focus()
          .insertContentAt({ from: cleanupSource.from, to: cleanupSource.to }, html)
          .run();
      } else {
        editor.chain().focus().setContent(html, true).run();
      }
      setNotice(t('workspace.cleanupApplied'));
    },
    [cleanupSource, t],
  );

  const handleAiRequest = useCallback((selection: EditorSelectionContext | null) => {
    // The assistant is a standalone text tool: a selection seeds the editable
    // input, while no selection opens an empty box for typing or pasting.
    setAiContext({ text: selection?.text ?? '', selection });
    setAiOpen(true);
  }, []);

  const handleSourceAiText = useCallback((text: string) => {
    setAiContext({ text, selection: null });
    setAiOpen(true);
  }, []);

  const handleOcrAssistant = useCallback(
    (text: string) => {
      handleSourceAiText(text);
    },
    [handleSourceAiText],
  );

  const handleApplyAi = useCallback(
    (text: string, mode: 'insert' | 'append') => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      const size = editor.state.doc.content.size;
      if (mode === 'append') {
        const blocks = text
          .split(/\n\s*\n+/)
          .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
          .filter(Boolean);
        if (blocks.length === 0) {
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
      } else {
        // Insert at the editor position captured when the dialog opened (or
        // the current caret when no selection was used), never replacing text.
        const position = Math.min(aiContext?.selection?.to ?? editor.state.selection.to, size);
        editor.chain().focus().insertContentAt(position, textToHtmlParagraphs(text)).run();
      }
      setNotice(t('assistant.applied'));
    },
    [aiContext, t],
  );

  const handleUndoAi = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.chain().focus().undo().run();
    setNotice(t('assistant.reverted'));
  }, [t]);

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

  const handleApplyRefinement = useCallback(
    async (result: RefinedImageResult) => {
      if (!document) {
        throw new Error('Document is not loaded');
      }
      const isPng = result.blob.type === 'image/png';
      const baseName = sanitizeFileName(document.source.fileName.replace(/\.[^.]+$/, ''));
      const saved = await saveRefinedImage(document.id, {
        blob: result.blob,
        mimeType: result.blob.type || (isPng ? 'image/png' : 'image/jpeg'),
        fileName: `${baseName}-refined.${isPng ? 'png' : 'jpg'}`,
        width: result.width,
        height: result.height,
        preset: result.preset,
        params: result.params,
      });
      if (!saved) {
        throw new Error('Document not found');
      }
      setDocument(saved.document);
      setRefinedAsset(saved.asset);
      setRefineOpen(false);
      setNotice(t('refine.applied'));
    },
    [document, t],
  );

  const handleRevertRefinement = useCallback(async () => {
    if (!document) {
      throw new Error('Document is not loaded');
    }
    const updated = await clearRefinedImage(document.id);
    if (!updated) {
      throw new Error('Document not found');
    }
    setDocument(updated);
    setRefinedAsset(null);
  }, [document]);

  const handleOcrPage = useCallback((pageNumber: number) => {
    setOcrTarget({ kind: 'pdf', pageNumber });
  }, []);

  const handleOcrImage = useCallback(() => {
    setOcrTarget({ kind: 'image' });
  }, []);

  const handleOcrRegion = useCallback((blob: Blob) => {
    setOcrTarget({ kind: 'region', blob });
  }, []);

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

  const handleExport = async (format: ExportFormat) => {
    setExportOpen(false);
    const editor = editorRef.current;
    if (!editor || !document || exporting) {
      return;
    }
    setError(null);
    try {
      if (format === 'docx') {
        setExporting(true);
        await exportDocx(document.title, editor.getJSON());
        return;
      }
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
    } finally {
      setExporting(false);
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
    <div className={clsx(styles.page, isFocusMode && styles.focusMode)}>
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

      {fullscreenError ? (
        <div className={styles.fullscreenNotice} role="status">
          <span>{t('workspace.fullscreenFallback')}</span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={clearFullscreenError}
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
        className={clsx(styles.panels, isFocusMode && styles.focusPanels)}
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
              onOcrPage={handleOcrPage}
              onOcrImage={handleOcrImage}
              onOcrRegion={handleOcrRegion}
              onAiText={handleSourceAiText}
              onRefineImage={() => setRefineOpen(true)}
              hasRefinedImage={!!document.source.refined}
            />
          ) : (
            <p className={styles.panelFallback}>{t('workspace.sourceError')}</p>
          )}
        </div>

        {isFocusMode ? <FocusModeExitControl onExit={() => setFocusMode(false)} /> : null}

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
            panelTitle={
              <div className={styles.documentTitleGroup}>
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
                <span className={styles.saveState} data-state={saveState} role="status">
                  {saveLabel}
                </span>
              </div>
            }
            fullWorkspace={isFocusMode}
            headerActions={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={() => setTranslatorOpen(true)}
                  disabled={!editorReady}
                  aria-label={t('translator.open')}
                  title={t('translator.open')}
                >
                  <Languages size={16} aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={handleOpenCleanup}
                  disabled={!editorReady}
                  aria-label={t('workspace.cleanup')}
                  title={t('workspace.cleanup')}
                >
                  <Eraser size={16} aria-hidden="true" />
                </Button>
                <div className={styles.exportWrap} ref={menuRef}>
                  <Button
                    variant="primary"
                    size="sm"
                    iconOnly
                    aria-label={exporting ? t('workspace.exporting') : t('workspace.export')}
                    title={exporting ? t('workspace.exporting') : t('workspace.export')}
                    aria-haspopup="menu"
                    aria-expanded={exportOpen}
                    onClick={() => setExportOpen((value) => !value)}
                    disabled={exporting}
                    aria-busy={exporting}
                  >
                    <Download size={16} aria-hidden="true" />
                  </Button>
                  {exportOpen ? (
                    <div className={styles.menu} role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.menuItem}
                        onClick={() => void handleExport('txt')}
                      >
                        <FileText size={16} aria-hidden="true" />
                        {t('workspace.exportTxt')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.menuItem}
                        onClick={() => void handleExport('html')}
                      >
                        <FileType2 size={16} aria-hidden="true" />
                        {t('workspace.exportHtml')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.menuItem}
                        onClick={() => void handleExport('docx')}
                      >
                        <FileType size={16} aria-hidden="true" />
                        {t('workspace.exportDocx')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.menuItem}
                        onClick={() => void handleExport('pdf')}
                      >
                        <Printer size={16} aria-hidden="true" />
                        {t('workspace.exportPdf')}
                      </button>
                    </div>
                  ) : null}
                </div>
                {fullWorkspaceEnabled ? (
                  <Button
                    ref={focusToggleRef}
                    variant={isFocusMode ? 'secondary' : 'ghost'}
                    size="sm"
                    iconOnly
                    onClick={() => setFocusMode(!isFocusMode)}
                    disabled={!editorReady}
                    aria-label={t(isFocusMode ? 'workspace.exitFocusMode' : 'workspace.focusMode')}
                    title={t(isFocusMode ? 'workspace.exitFocusMode' : 'workspace.focusMode')}
                    aria-pressed={isFocusMode}
                  >
                    <Focus size={16} aria-hidden="true" />
                  </Button>
                ) : null}
              </>
            }
            onEditorReady={handleEditorReady}
            onSaveStateChange={handleSaveStateChange}
            onAiRequest={handleAiRequest}
          />
        </div>
      </div>

      {notice ? (
        <p className={styles.toast} role="status">
          {notice}
        </p>
      ) : null}

      <OcrDialog
        target={ocrTarget}
        sourceAsset={asset}
        refinedAsset={refinedAsset}
        pdfPageCount={document.source.pageCount ?? 1}
        onClose={() => setOcrTarget(null)}
        onInsert={handleInsertText}
        onUseWithAssistant={handleOcrAssistant}
      />

      <CleanupDialog
        open={cleanupOpen}
        sourceText={cleanupSource?.text ?? ''}
        scope={cleanupSource?.scope ?? 'document'}
        onClose={() => setCleanupOpen(false)}
        onApply={handleApplyCleanup}
      />

      <AiAssistantDialog
        open={aiOpen}
        initialText={aiContext?.text ?? ''}
        onClose={() => setAiOpen(false)}
        onApply={handleApplyAi}
        onUndo={handleUndoAi}
        onOpenSettings={() => {
          setAiOpen(false);
          navigate('/settings');
        }}
      />

      <TranslatorDialog
        open={translatorOpen}
        onClose={() => setTranslatorOpen(false)}
        onOpenSettings={() => {
          setTranslatorOpen(false);
          navigate('/settings');
        }}
      />

      {asset && asset.mimeType.startsWith('image/') ? (
        <ImageRefineDialog
          open={refineOpen}
          asset={asset}
          hasSavedRefinement={!!document.source.refined}
          savedParams={document.source.refined?.params ?? null}
          savedPreset={document.source.refined?.preset ?? null}
          onClose={() => setRefineOpen(false)}
          onApply={handleApplyRefinement}
          onRevert={handleRevertRefinement}
          onOpenSettings={() => {
            setRefineOpen(false);
            navigate('/settings');
          }}
        />
      ) : null}
    </div>
  );
}
