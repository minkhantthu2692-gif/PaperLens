import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  FileText,
  FileType2,
  ImageDown,
  Image as ImageIcon,
  Maximize,
  MousePointer2,
  ScanLine,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type * as PdfJs from 'pdfjs-dist';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import { Button } from '@/components/ui/Button';
import type { SourceAsset } from '@/domain/document';
import { downloadBlob, sanitizeFileName } from '@/lib/file';
import { formatBytes } from '@/lib/format';
import { MAX_TEXT_CHARACTERS } from '@/services/import/fileValidation';
import styles from './SourcePanel.module.css';
import { useRegionSelection, type SelectionRect } from './useRegionSelection';

interface SourcePanelProps {
  asset: SourceAsset;
  pageCount?: number | undefined;
  onPageCount: (count: number) => void;
  onInsertText: (text: string) => void;
}

type PdfModule = typeof PdfJs;
type PdfDocument = PDFDocumentProxy;

interface TextSpan {
  text: string;
  left: number;
  top: number;
  fontSize: number;
  angle: number;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;

function clampScale(value: number): number {
  return Math.min(Math.max(value, MIN_SCALE), MAX_SCALE);
}

function cropToCanvas(
  element: HTMLCanvasElement | HTMLImageElement,
  rect: SelectionRect,
): HTMLCanvasElement | null {
  const displayedWidth = element.clientWidth;
  const displayedHeight = element.clientHeight;
  if (!displayedWidth || !displayedHeight || rect.width < 2 || rect.height < 2) {
    return null;
  }
  const sourceWidth = element instanceof HTMLImageElement ? element.naturalWidth : element.width;
  const sourceHeight = element instanceof HTMLImageElement ? element.naturalHeight : element.height;
  const scaleX = sourceWidth / displayedWidth;
  const scaleY = sourceHeight / displayedHeight;

  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(rect.width * scaleX));
  output.height = Math.max(1, Math.round(rect.height * scaleY));
  const context = output.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(
    element,
    rect.x * scaleX,
    rect.y * scaleY,
    rect.width * scaleX,
    rect.height * scaleY,
    0,
    0,
    output.width,
    output.height,
  );
  return output;
}

async function copyRegion(
  element: HTMLCanvasElement | HTMLImageElement,
  rect: SelectionRect,
): Promise<boolean> {
  const canvas = cropToCanvas(element, rect);
  if (!canvas) {
    return false;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    return false;
  }
  if (
    typeof ClipboardItem !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function'
  ) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function downloadRegion(
  element: HTMLCanvasElement | HTMLImageElement,
  rect: SelectionRect,
  fileName: string,
): boolean {
  const canvas = cropToCanvas(element, rect);
  if (!canvas) {
    return false;
  }
  canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, fileName);
    }
  }, 'image/png');
  return true;
}

function buildTextSpans(
  pdfjs: PdfModule,
  viewport: PageViewport,
  items: Array<{ str?: string; transform?: number[] }>,
): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const item of items) {
    if (!item.str || !item.transform) {
      continue;
    }
    const transform = pdfjs.Util.transform(viewport.transform, item.transform);
    const angle = Math.atan2(transform[1] ?? 0, transform[0] ?? 0);
    const fontSize = Math.hypot(transform[2] ?? 0, transform[3] ?? 0);
    spans.push({
      text: item.str,
      left: transform[4] ?? 0,
      top: (transform[5] ?? 0) - fontSize,
      fontSize,
      angle,
    });
    if (spans.length >= 5000) {
      break;
    }
  }
  return spans;
}

function RegionRect({ rect }: { rect: SelectionRect }) {
  return (
    <div
      className={styles.regionRect}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <span className={styles.handle} data-corner="nw" />
      <span className={styles.handle} data-corner="ne" />
      <span className={styles.handle} data-corner="sw" />
      <span className={styles.handle} data-corner="se" />
    </div>
  );
}

export function SourcePanel({ asset, pageCount, onPageCount, onInsertText }: SourcePanelProps) {
  const { t } = useTranslation();
  const kindLabel =
    asset.mimeType === 'application/pdf'
      ? t('workspace.pdfSource')
      : asset.mimeType.startsWith('image/')
        ? t('workspace.imageSource')
        : t('workspace.textSource');
  const KindIcon =
    asset.mimeType === 'application/pdf'
      ? FileType2
      : asset.mimeType.startsWith('image/')
        ? ImageIcon
        : FileText;

  return (
    <section className={styles.shell} aria-label={t('workspace.source')}>
      <header className={styles.panelHeader}>
        <KindIcon size={16} aria-hidden="true" />
        <span>{kindLabel}</span>
        <span className={styles.meta} title={asset.fileName}>
          {t('workspace.sourceMeta', {
            name: asset.fileName,
            size: formatBytes(asset.size),
          })}
        </span>
      </header>

      {asset.mimeType === 'application/pdf' ? (
        <PdfSource
          asset={asset}
          {...(pageCount !== undefined ? { initialPageCount: pageCount } : {})}
          onPageCount={onPageCount}
          onInsertText={onInsertText}
        />
      ) : asset.mimeType.startsWith('image/') ? (
        <ImageSource asset={asset} />
      ) : (
        <TextSource asset={asset} onInsertText={onInsertText} />
      )}
    </section>
  );
}

function PdfSource({
  asset,
  initialPageCount,
  onPageCount,
  onInsertText,
}: {
  asset: SourceAsset;
  initialPageCount?: number;
  onPageCount: (count: number) => void;
  onInsertText: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [pdfjs, setPdfjs] = useState<PdfModule | null>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [numPages, setNumPages] = useState(initialPageCount ?? 0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [spans, setSpans] = useState<TextSpan[]>([]);
  const [pageText, setPageText] = useState('');
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<'text' | 'region'>('text');
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selection = useRegionSelection(mode === 'region');
  const clearSelection = selection.clear;

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PdfDocument | null = null;
    void (async () => {
      try {
        const pdfModule = await import('pdfjs-dist');
        const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfModule.GlobalWorkerOptions.workerSrc = workerModule.default;
        const data = await asset.blob.arrayBuffer();
        const documentProxy = await pdfModule.getDocument({ data }).promise;
        loadedDocument = documentProxy;
        if (cancelled) {
          void documentProxy.destroy();
          return;
        }
        setPdfjs(pdfModule);
        setPdf(documentProxy);
        setNumPages(documentProxy.numPages);
        onPageCount(documentProxy.numPages);
      } catch {
        if (!cancelled) {
          setError(true);
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void loadedDocument?.destroy();
    };
  }, [asset, onPageCount]);

  useEffect(() => {
    if (!pdf || !pdfjs) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        setRendering(true);
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) {
          return;
        }
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext('2d');
        if (!context) {
          return;
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const textContent = await page.getTextContent();
        if (cancelled) {
          return;
        }
        const items: Array<{ str: string; transform: number[] }> = [];
        for (const item of textContent.items) {
          if ('str' in item && Array.isArray(item.transform)) {
            items.push({ str: item.str, transform: item.transform });
          }
        }
        setSpans(buildTextSpans(pdfjs, viewport, items));
        let text = '';
        for (const item of textContent.items) {
          if ('str' in item) {
            text += item.str;
            text += item.hasEOL ? '\n' : ' ';
          }
        }
        setPageText(text.trim());
        setPageSize({ width: viewport.width, height: viewport.height });
        clearSelection();
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pdfjs, pageNumber, scale, clearSelection]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timer = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const fitWidth = useCallback(async () => {
    if (!pdf) {
      return;
    }
    try {
      const page = await pdf.getPage(pageNumber);
      const baseWidth = page.getViewport({ scale: 1 }).width;
      const available = (scrollRef.current?.clientWidth ?? 640) - 48;
      if (baseWidth > 0) {
        setScale(clampScale(available / baseWidth));
      }
    } catch {
      // Keep the current scale.
    }
  }, [pdf, pageNumber]);

  const handleCopy = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !selection.rect) {
      return;
    }
    const copied = await copyRegion(canvas, selection.rect);
    setStatus(copied ? t('workspace.copied') : t('workspace.copyFailed'));
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !selection.rect) {
      return;
    }
    const name = `${sanitizeFileName(asset.fileName.replace(/\.[^.]+$/, ''))}-page-${pageNumber}.png`;
    downloadRegion(canvas, selection.rect, name);
  };

  return (
    <>
      <div className={styles.toolbar} role="toolbar" aria-label={t('workspace.pdfSource')}>
        <div className={styles.toolGroup}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
            disabled={pageNumber <= 1}
            aria-label={t('workspace.previousPage')}
            title={t('workspace.previousPage')}
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </Button>
          <span className={styles.pageIndicator}>
            {t('workspace.pageOf', { page: pageNumber, total: numPages || 1 })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => {
              setPageNumber((page) => Math.min(numPages || 1, page + 1));
            }}
            disabled={pageNumber >= (numPages || 1)}
            aria-label={t('workspace.nextPage')}
            title={t('workspace.nextPage')}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </Button>
        </div>

        <div className={styles.toolGroup}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setScale((value) => clampScale(value - SCALE_STEP))}
            aria-label={t('workspace.zoomOut')}
            title={t('workspace.zoomOut')}
          >
            <ZoomOut size={17} aria-hidden="true" />
          </Button>
          <span className={styles.percent}>{Math.round(scale * 100)}%</span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setScale((value) => clampScale(value + SCALE_STEP))}
            aria-label={t('workspace.zoomIn')}
            title={t('workspace.zoomIn')}
          >
            <ZoomIn size={17} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => void fitWidth()}
            aria-label={t('workspace.fitWidth')}
            title={t('workspace.fitWidth')}
          >
            <Maximize size={16} aria-hidden="true" />
          </Button>
        </div>

        <div className={styles.toolGroup}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            className={mode === 'text' ? styles.active : undefined}
            onClick={() => setMode('text')}
            aria-label={t('workspace.selectText')}
            title={t('workspace.selectText')}
            aria-pressed={mode === 'text'}
          >
            <MousePointer2 size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            className={mode === 'region' ? styles.active : undefined}
            onClick={() => {
              setMode('region');
              setStatus(null);
            }}
            aria-label={t('workspace.selectRegion')}
            title={t('workspace.selectRegion')}
            aria-pressed={mode === 'region'}
          >
            <ScanLine size={17} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setThumbnailsOpen((value) => !value)}
            aria-label={t('workspace.toggleThumbnails')}
            title={t('workspace.thumbnails')}
            aria-expanded={thumbnailsOpen}
          >
            <FileType2 size={16} aria-hidden="true" />
          </Button>
        </div>

        <div className={styles.toolGroup}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onInsertText(pageText)}
            disabled={!pageText}
            title={t('workspace.insertPageText')}
          >
            <FileText size={15} aria-hidden="true" />
            {t('workspace.insertPageText')}
          </Button>
        </div>
      </div>

      {thumbnailsOpen && pdf ? (
        <div className={styles.thumbStrip}>
          {Array.from({ length: numPages }, (_, index) => (
            <PdfThumbnail
              key={index + 1}
              pdf={pdf}
              pageNumber={index + 1}
              active={pageNumber === index + 1}
              onSelect={() => {
                setPageNumber(index + 1);
                setThumbnailsOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}

      {mode === 'region' ? (
        <div className={styles.regionBar}>
          <span>{t('workspace.regionHint')}</span>
          {selection.rect ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
                <Clipboard size={15} aria-hidden="true" />
                {t('workspace.copyRegion')}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownload}>
                <ImageDown size={15} aria-hidden="true" />
                {t('workspace.downloadRegion')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={selection.clear}
                aria-label={t('workspace.clearSelection')}
                title={t('workspace.clearSelection')}
              >
                <X size={15} aria-hidden="true" />
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className={styles.statusText} role="status">
          <Check size={14} aria-hidden="true" />
          {status}
        </p>
      ) : null}

      <div ref={scrollRef} className={styles.scroll}>
        {error ? (
          <p className={styles.errorText} role="alert">
            {t('workspace.sourceError')}
          </p>
        ) : (
          <div
            className={styles.pdfStage}
            style={{
              width: pageSize.width || undefined,
              height: pageSize.height || undefined,
            }}
          >
            <canvas ref={canvasRef} className={styles.canvas} aria-label={t('workspace.source')} />
            <div
              className={clsx(styles.textLayer, mode === 'region' && styles.textLayerInactive)}
              style={{ width: pageSize.width, height: pageSize.height }}
            >
              {spans.map((span, index) => (
                <span
                  key={index}
                  style={{
                    left: span.left,
                    top: span.top,
                    fontSize: span.fontSize,
                    transform: span.angle ? `rotate(${span.angle}rad)` : undefined,
                  }}
                >
                  {span.text}
                </span>
              ))}
            </div>
            <div
              className={clsx(styles.regionLayer, mode !== 'region' && styles.regionLayerInactive)}
              style={{ width: pageSize.width, height: pageSize.height }}
              {...selection.handlers}
            >
              {selection.rect ? <RegionRect rect={selection.rect} /> : null}
            </div>
            {rendering ? (
              <span className={styles.loadingOverlay} role="status">
                {t('workspace.sourceLoading')}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function PdfThumbnail({
  pdf,
  pageNumber,
  active,
  onSelect,
}: {
  pdf: PdfDocument;
  pageNumber: number;
  active: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.22 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext('2d');
        if (!context || cancelled) {
          return;
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        await page.render({ canvasContext: context, viewport }).promise;
      } catch {
        // A failed thumbnail is non-fatal.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  return (
    <button
      type="button"
      className={clsx(styles.thumbnail, active && styles.thumbnailActive)}
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      aria-label={String(pageNumber)}
    >
      <canvas ref={canvasRef} className={styles.thumbnailCanvas} />
      <span className={styles.thumbnailNumber}>{pageNumber}</span>
    </button>
  );
}

function ImageSource({ asset }: { asset: SourceAsset }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'view' | 'region'>('view');
  const [status, setStatus] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const selection = useRegionSelection(mode === 'region');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(asset.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [asset]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timer = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleCopy = async () => {
    const image = imageRef.current;
    if (!image || !selection.rect) {
      return;
    }
    const copied = await copyRegion(image, selection.rect);
    setStatus(copied ? t('workspace.copied') : t('workspace.copyFailed'));
  };

  return (
    <>
      <div className={styles.toolbar} role="toolbar" aria-label={t('workspace.imageSource')}>
        <div className={styles.toolGroup}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setZoom((value) => clampScale(value - 0.25))}
            aria-label={t('workspace.zoomOut')}
            title={t('workspace.zoomOut')}
          >
            <ZoomOut size={17} aria-hidden="true" />
          </Button>
          <span className={styles.percent}>{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setZoom((value) => clampScale(value + 0.25))}
            aria-label={t('workspace.zoomIn')}
            title={t('workspace.zoomIn')}
          >
            <ZoomIn size={17} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setZoom(1)}
            aria-label={t('workspace.fitWidth')}
            title={t('workspace.fitWidth')}
          >
            <Maximize size={16} aria-hidden="true" />
          </Button>
        </div>
        <div className={styles.toolGroup}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            className={mode === 'region' ? styles.active : undefined}
            onClick={() => setMode(mode === 'region' ? 'view' : 'region')}
            aria-label={t('workspace.selectRegion')}
            title={t('workspace.selectRegion')}
            aria-pressed={mode === 'region'}
          >
            <ScanLine size={17} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {mode === 'region' ? (
        <div className={styles.regionBar}>
          <span>{t('workspace.regionHint')}</span>
          {selection.rect ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
                <Clipboard size={15} aria-hidden="true" />
                {t('workspace.copyRegion')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const image = imageRef.current;
                  if (image && selection.rect) {
                    downloadRegion(
                      image,
                      selection.rect,
                      `${sanitizeFileName(asset.fileName.replace(/\.[^.]+$/, ''))}-region.png`,
                    );
                  }
                }}
              >
                <Download size={15} aria-hidden="true" />
                {t('workspace.downloadRegion')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={selection.clear}
                aria-label={t('workspace.clearSelection')}
                title={t('workspace.clearSelection')}
              >
                <X size={15} aria-hidden="true" />
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className={styles.statusText} role="status">
          <Check size={14} aria-hidden="true" />
          {status}
        </p>
      ) : null}

      <div className={styles.scroll}>
        {url ? (
          <div className={styles.imageStage} style={{ width: `${zoom * 100}%` }}>
            <img ref={imageRef} src={url} alt={asset.fileName} className={styles.image} />
            <div
              className={clsx(styles.regionLayer, mode !== 'region' && styles.regionLayerInactive)}
              {...selection.handlers}
            >
              {selection.rect ? <RegionRect rect={selection.rect} /> : null}
            </div>
          </div>
        ) : (
          <p role="status">{t('common.loading')}</p>
        )}
      </div>
    </>
  );
}

function TextSource({
  asset,
  onInsertText,
}: {
  asset: SourceAsset;
  onInsertText: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const content = (await asset.blob.text()).slice(0, MAX_TEXT_CHARACTERS);
        if (!cancelled) {
          setText(content);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  return (
    <>
      <div className={styles.toolbar}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onInsertText(text)}
          disabled={!text}
          title={t('workspace.insertAllText')}
        >
          <FileText size={15} aria-hidden="true" />
          {t('workspace.insertAllText')}
        </Button>
      </div>
      <div className={styles.scroll}>
        {error ? (
          <p className={styles.errorText} role="alert">
            {t('workspace.sourceError')}
          </p>
        ) : text ? (
          <pre className={styles.textPreview}>{text}</pre>
        ) : (
          <p role="status">{t('common.loading')}</p>
        )}
      </div>
    </>
  );
}
