import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Clipboard, ScanText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { SourceAsset } from '@/domain/document';
import {
  createOcrSession,
  isOcrLanguage,
  type OcrLanguageId,
  type OcrSession,
} from '@/services/ocr/ocrEngine';
import { combineOcrPages, reconstructOcrText } from '@/services/ocr/ocrText';
import { openPdfRenderer, type PdfPageRenderer } from '@/services/ocr/pdfRenderer';
import styles from './OcrDialog.module.css';

export type OcrTarget =
  { kind: 'pdf'; pageNumber: number } | { kind: 'image' } | { kind: 'region'; blob: Blob };

type OcrStatus = 'idle' | 'running' | 'cancelled' | 'done' | 'error';

interface OcrDialogProps {
  target: OcrTarget | null;
  sourceAsset: SourceAsset | null;
  pdfPageCount?: number | undefined;
  onClose: () => void;
  onInsert: (text: string) => void;
}

const LANGUAGE_STORAGE_KEY = 'paperlens.ocr.language';

function readOcrLanguage(): OcrLanguageId {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isOcrLanguage(stored) ? stored : 'eng';
  } catch {
    return 'eng';
  }
}

export function OcrDialog({
  target,
  sourceAsset,
  pdfPageCount,
  onClose,
  onInsert,
}: OcrDialogProps) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<OcrLanguageId>(readOcrLanguage);
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [pageInfo, setPageInfo] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const workerRef = useRef<OcrSession | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    setStatus('idle');
    setProgress(0);
    setPageInfo({ current: 0, total: 0 });
    setResult('');
    setError(null);
    setCopied(false);
    setScope('current');
  }, [target]);

  useEffect(() => {
    if (target?.kind !== 'region') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(target.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [target]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      void workerRef.current?.terminate().catch(() => undefined);
    };
  }, []);

  const resetOutput = () => {
    setResult('');
    setError(null);
    setStatus('idle');
    setProgress(0);
    setPageInfo({ current: 0, total: 0 });
    setCopied(false);
  };

  const cancelOcr = () => {
    cancelledRef.current = true;
    void workerRef.current?.terminate().catch(() => undefined);
    workerRef.current = null;
    setStatus('cancelled');
  };

  const handleClose = useCallback(() => {
    cancelledRef.current = true;
    void workerRef.current?.terminate().catch(() => undefined);
    workerRef.current = null;
    onClose();
  }, [onClose]);

  const startOcr = async () => {
    if (!target || status === 'running') {
      return;
    }
    if (target.kind !== 'region' && !sourceAsset) {
      setError(t('ocr.noSource'));
      return;
    }

    cancelledRef.current = false;
    setStatus('running');
    setProgress(0);
    setPageInfo({ current: 0, total: 0 });
    setResult('');
    setError(null);
    setCopied(false);

    let renderer: PdfPageRenderer | null = null;
    let session: OcrSession | null = null;

    try {
      let images: Blob[] = [];
      let total = 1;

      if (target.kind === 'region') {
        images = [target.blob];
      } else if (target.kind === 'image') {
        if (!sourceAsset) {
          throw new Error('Source asset is missing');
        }
        images = [sourceAsset.blob];
      } else {
        if (!sourceAsset || sourceAsset.mimeType !== 'application/pdf') {
          throw new Error('PDF source is missing');
        }
        renderer = await openPdfRenderer(sourceAsset.blob);
        total = scope === 'all' ? renderer.pageCount : 1;
      }

      if (cancelledRef.current) {
        return;
      }

      session = await createOcrSession(language);
      workerRef.current = session;
      if (cancelledRef.current) {
        return;
      }

      const chunks: string[] = [];
      for (let index = 0; index < total; index += 1) {
        if (cancelledRef.current) {
          return;
        }
        const pageNumber =
          target.kind === 'pdf' ? (scope === 'all' ? index + 1 : target.pageNumber) : 1;
        setPageInfo({ current: index + 1, total });
        const image = renderer ? await renderer.renderPage(pageNumber) : images[0];
        if (!image) {
          throw new Error('No image to recognize');
        }
        if (cancelledRef.current) {
          return;
        }
        const text = await session.recognize(image, (value) => {
          const bounded = Math.min(Math.max(value, 0), 1);
          setProgress((index + bounded) / total);
        });
        chunks.push(text);
      }

      if (cancelledRef.current) {
        return;
      }

      const combined = combineOcrPages(chunks.map(reconstructOcrText));
      setResult(combined);
      setProgress(1);
      setStatus('done');
    } catch {
      if (!cancelledRef.current) {
        setStatus('error');
        setError(t('ocr.failed'));
      }
    } finally {
      if (workerRef.current === session) {
        workerRef.current = null;
      }
      if (session) {
        await session.terminate().catch(() => undefined);
      }
      if (renderer) {
        await renderer.destroy().catch(() => undefined);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch {
      setError(t('ocr.copyFailed'));
    }
  };

  const isPdf = target?.kind === 'pdf';
  const percent = Math.round(progress * 100);

  const footer =
    status === 'running' ? (
      <Button variant="danger" onClick={cancelOcr}>
        {t('ocr.cancel')}
      </Button>
    ) : (
      <>
        <Button variant="ghost" onClick={handleClose}>
          {t('common.close')}
        </Button>
        {result ? (
          <Button
            variant="primary"
            onClick={() => {
              onInsert(result);
              handleClose();
            }}
          >
            {t('ocr.insert')}
          </Button>
        ) : null}
        <Button
          variant={result ? 'secondary' : 'primary'}
          onClick={() => void startOcr()}
          disabled={!target || (target.kind !== 'region' && !sourceAsset)}
        >
          <ScanText size={16} aria-hidden="true" />
          {status === 'idle' ? t('ocr.start') : t('ocr.retry')}
        </Button>
      </>
    );

  return (
    <Dialog
      open={target !== null}
      title={t('ocr.title')}
      description={t('ocr.description')}
      onClose={handleClose}
      footer={footer}
    >
      {target ? (
        <div className={styles.body}>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ocr-language">
                {t('ocr.language')}
              </label>
              <select
                id="ocr-language"
                className={styles.select}
                value={language}
                disabled={status === 'running'}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isOcrLanguage(value)) {
                    setLanguage(value);
                    resetOutput();
                    try {
                      localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
                    } catch {
                      // The language still applies for this session.
                    }
                  }
                }}
              >
                <option value="eng">{t('ocr.languageEnglish')}</option>
                <option value="mya">{t('ocr.languageBurmese')}</option>
                <option value="eng+mya">{t('ocr.languageBoth')}</option>
              </select>
            </div>

            {isPdf && (pdfPageCount ?? 1) > 1 ? (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ocr-scope">
                  {t('ocr.scope')}
                </label>
                <select
                  id="ocr-scope"
                  className={styles.select}
                  value={scope}
                  disabled={status === 'running'}
                  onChange={(event) => {
                    setScope(event.target.value === 'all' ? 'all' : 'current');
                    resetOutput();
                  }}
                >
                  <option value="current">{t('ocr.scopeCurrent')}</option>
                  <option value="all">{t('ocr.scopeAll', { count: pdfPageCount ?? 1 })}</option>
                </select>
              </div>
            ) : null}
          </div>

          {target.kind === 'region' && previewUrl ? (
            <img className={styles.previewImage} src={previewUrl} alt={t('ocr.regionLabel')} />
          ) : null}

          {status === 'running' ? (
            <div className={styles.progressArea} role="status" aria-live="polite">
              {pageInfo.total > 0 ? (
                <>
                  <progress className={styles.progress} value={percent} max={100} />
                  <div className={styles.progressLabels}>
                    <span>
                      {t('ocr.pageProgress', { page: pageInfo.current, total: pageInfo.total })}
                    </span>
                    <span>{percent}%</span>
                  </div>
                </>
              ) : (
                <>
                  <progress className={styles.progress} />
                  <p className={styles.hint}>{t('ocr.preparing')}</p>
                </>
              )}
            </div>
          ) : null}

          {status === 'cancelled' ? (
            <p className={styles.cancelled} role="status">
              {t('ocr.cancelled')}
            </p>
          ) : null}

          {error ? (
            <div className={styles.alert} role="alert">
              <AlertCircle size={17} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {status === 'done' && !result ? (
            <p className={styles.empty} role="status">
              {t('ocr.empty')}
            </p>
          ) : null}

          {result ? (
            <div className={styles.result}>
              <div className={styles.resultHeader}>
                <span className={styles.resultTitle}>{t('ocr.result')}</span>
                <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
                  {copied ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Clipboard size={15} aria-hidden="true" />
                  )}
                  {copied ? t('ocr.copied') : t('common.copy')}
                </Button>
              </div>
              <pre className={styles.resultText} tabIndex={0}>
                {result}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
