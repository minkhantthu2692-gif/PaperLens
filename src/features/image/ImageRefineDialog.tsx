import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Eye, Redo2, RotateCcw, RotateCw, Sparkles, Undo2, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import formStyles from '@/components/ui/Form.module.css';
import type { SourceAsset } from '@/domain/document';
import {
  DEFAULT_REFINEMENT_PARAMS,
  createDefaultPerspectiveQuad,
  normalizeRefinementParams,
  refinementParamsEqual,
  type AiImageReport,
  type ImageIssueCode,
  type ImageQualityReport,
  type IssueSeverity,
  type PerspectiveQuad,
  type RefinementParams,
  type RefinementPresetId,
} from '@/domain/refinement';
import { AiError, type AiErrorCode } from '@/services/ai/client';
import { mergeAiRefinementParams, requestAiImageRefinement } from '@/services/ai/imageRefinement';
import { getActiveApiKey } from '@/services/ai/keys';
import { providerSupportsImageInput } from '@/services/ai/providers';
import { loadAiSettings } from '@/services/ai/settings';
import { createDownscaledDataUrl, decodeImageBlob } from '@/services/image/codec';
import { resizeBuffer } from '@/services/image/filters';
import { suggestAutoRefine } from '@/services/image/pipeline';
import { getPresetParams } from '@/services/image/presets';
import { refineImage } from '@/services/image/refineClient';
import styles from './ImageRefineDialog.module.css';

const PREVIEW_MAX_DIMENSION = 1400;
const ANALYSIS_MAX_DIMENSION = 1024;
const AI_MAX_DIMENSION = 1024;
const FULL_MAX_DIMENSION = 4096;
const FULL_MAX_PIXELS = 24_000_000;
const PREVIEW_DEBOUNCE_MS = 220;

const PRESET_LABEL_KEYS = {
  document: 'refine.presetDocument',
  handwriting: 'refine.presetHandwriting',
  'old-scan': 'refine.presetOldScan',
  camera: 'refine.presetCamera',
  'low-contrast': 'refine.presetLowContrast',
} as const satisfies Record<RefinementPresetId, string>;

const ISSUE_LABEL_KEYS = {
  'low-light': 'refine.issueLowLight',
  'over-exposed': 'refine.issueOverExposed',
  'low-contrast': 'refine.issueLowContrast',
  blur: 'refine.issueBlur',
  noise: 'refine.issueNoise',
  skew: 'refine.issueSkew',
  'uneven-lighting': 'refine.issueUnevenLighting',
  'faint-text': 'refine.issueFaintText',
  curvature: 'refine.issueCurvature',
  perspective: 'refine.issuePerspective',
  handwriting: 'refine.issueHandwriting',
  'difficult-regions': 'refine.issueDifficultRegions',
} as const satisfies Record<ImageIssueCode, string>;

const SEVERITY_LABEL_KEYS = {
  low: 'refine.severityLow',
  medium: 'refine.severityMedium',
  high: 'refine.severityHigh',
} as const satisfies Record<IssueSeverity, string>;

const CORNER_LABEL_KEYS = {
  topLeft: 'refine.cornerTopLeft',
  topRight: 'refine.cornerTopRight',
  bottomRight: 'refine.cornerBottomRight',
  bottomLeft: 'refine.cornerBottomLeft',
} as const;

const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

type CornerKey = (typeof CORNERS)[number];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createObjectUrl(blob: Blob): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(blob);
  }
  return '';
}

function revokeObjectUrl(url: string): void {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

function aiErrorKey(code: AiErrorCode | 'not-configured') {
  switch (code) {
    case 'not-configured':
    case 'missing-key':
    case 'missing-model':
    case 'missing-base-url':
      return 'assistant.notConfigured' as const;
    case 'offline':
      return 'assistant.errorOffline' as const;
    case 'auth':
      return 'assistant.errorAuth' as const;
    case 'quota':
      return 'assistant.errorQuota' as const;
    case 'rate-limit':
      return 'assistant.errorRateLimit' as const;
    case 'network':
      return 'assistant.errorNetwork' as const;
    case 'timeout':
      return 'assistant.errorTimeout' as const;
    case 'server':
      return 'assistant.errorServer' as const;
    case 'busy':
      return 'assistant.errorBusy' as const;
    case 'cancelled':
      return 'assistant.errorCancelled' as const;
    case 'bad-request':
      return 'refine.aiErrorBadRequest' as const;
    case 'invalid-response':
      return 'refine.aiErrorInvalid' as const;
    default:
      return 'assistant.errorGeneric' as const;
  }
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  hint?: string | undefined;
  onChange: (value: number) => void;
  onBegin: () => void;
  onEnd: () => void;
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  disabled = false,
  hint,
  onChange,
  onBegin,
  onEnd,
}: SliderProps) {
  return (
    <div className={styles.control}>
      <div className={styles.controlHeader}>
        <label className={styles.controlLabel} htmlFor={id}>
          {label}
        </label>
        <span className={styles.controlValue}>{value}</span>
      </div>
      <input
        id={id}
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onPointerDown={onBegin}
        onPointerUp={onEnd}
        onKeyDown={onBegin}
        onKeyUp={onEnd}
        onBlur={onEnd}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string | undefined;
  onChange: (checked: boolean) => void;
}

function Toggle({ id, label, checked, disabled = false, hint, onChange }: ToggleProps) {
  return (
    <div className={styles.control}>
      <label className={styles.toggle} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

interface IssueDisplay {
  code: ImageIssueCode;
  severity: IssueSeverity;
  detail?: string;
}

function IssueList({ issues, t }: { issues: IssueDisplay[]; t: TFunction }) {
  if (issues.length === 0) {
    return <p className={styles.hint}>{t('refine.noIssues')}</p>;
  }
  return (
    <ul className={styles.issueList}>
      {issues.map((issue) => (
        <li key={issue.code} className={styles.issue} data-severity={issue.severity}>
          <span className={styles.issueCode}>{t(ISSUE_LABEL_KEYS[issue.code])}</span>
          <span className={styles.issueSeverity}>{t(SEVERITY_LABEL_KEYS[issue.severity])}</span>
          {issue.detail ? <span className={styles.issueDetail}>{issue.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function PerspectiveEditor({
  imageUrl,
  aspectRatio,
  quad,
  disabled,
  onChange,
  onCommit,
}: {
  imageUrl: string;
  aspectRatio?: string | undefined;
  quad: PerspectiveQuad;
  disabled: boolean;
  onChange: (quad: PerspectiveQuad) => void;
  onCommit: () => void;
}) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<CornerKey | null>(null);

  const handlePointerDown =
    (corner: CornerKey) => (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }
      draggingRef.current = corner;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const corner = draggingRef.current;
    if (!corner) {
      return;
    }
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return;
    }
    onChange({
      ...quad,
      [corner]: {
        x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
        y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
      },
    });
  };

  const handlePointerUp = () => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = null;
    onCommit();
  };

  const polygon = (['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const)
    .map((corner) => `${quad[corner].x},${quad[corner].y}`)
    .join(' ');

  return (
    <div className={styles.perspectiveWrap}>
      <div
        ref={stageRef}
        className={styles.perspectiveStage}
        style={aspectRatio ? { aspectRatio } : undefined}
      >
        {imageUrl ? <img src={imageUrl} alt="" className={styles.perspectiveImage} /> : null}
        <svg
          className={styles.perspectiveOutline}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points={polygon} vectorEffect="non-scaling-stroke" />
        </svg>
        {CORNERS.map((corner) => (
          <button
            key={corner}
            type="button"
            className={styles.perspectiveHandle}
            style={{ left: `${quad[corner].x * 100}%`, top: `${quad[corner].y * 100}%` }}
            aria-label={t(CORNER_LABEL_KEYS[corner])}
            disabled={disabled}
            onPointerDown={handlePointerDown(corner)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        ))}
      </div>
      <p className={styles.hint}>{t('refine.perspectiveHint')}</p>
      <p className={styles.hint}>{t('refine.perspectiveCornerHint')}</p>
    </div>
  );
}

export interface RefinedImageResult {
  blob: Blob;
  width: number;
  height: number;
  preset: RefinementPresetId | null;
  params: RefinementParams;
}

interface ImageRefineDialogProps {
  open: boolean;
  asset: SourceAsset;
  hasSavedRefinement: boolean;
  savedParams?: RefinementParams | null;
  savedPreset?: RefinementPresetId | null;
  onClose: () => void;
  onApply: (result: RefinedImageResult) => Promise<void>;
  onRevert: () => Promise<void>;
  onOpenSettings: () => void;
}

export function ImageRefineDialog({
  open,
  asset,
  hasSavedRefinement,
  savedParams,
  savedPreset,
  onClose,
  onApply,
  onRevert,
  onOpenSettings,
}: ImageRefineDialogProps) {
  const { t } = useTranslation();
  const [params, setParams] = useState<RefinementParams>(DEFAULT_REFINEMENT_PARAMS);
  const [preset, setPreset] = useState<RefinementPresetId | null>(null);
  const [past, setPast] = useState<RefinementParams[]>([]);
  const [future, setFuture] = useState<RefinementParams[]>([]);
  const [originalPreview, setOriginalPreview] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'applying'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [localReport, setLocalReport] = useState<ImageQualityReport | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'running'>('idle');
  const [aiReport, setAiReport] = useState<AiImageReport | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [aiError, setAiError] = useState<AiErrorCode | 'not-configured' | null>(null);
  const [view, setView] = useState<'after' | 'split' | 'before'>('split');
  const [splitPosition, setSplitPosition] = useState(50);
  const previewControllerRef = useRef<AbortController | null>(null);
  const aiControllerRef = useRef<AbortController | null>(null);
  const sliderBaselineRef = useRef<RefinementParams>(DEFAULT_REFINEMENT_PARAMS);
  const notificationRef = useRef<number | undefined>(undefined);

  const aiSettings = useMemo(() => (open ? loadAiSettings() : null), [open]);
  const aiKey = useMemo(
    () => (aiSettings ? (getActiveApiKey(aiSettings.providerId)?.key ?? '') : ''),
    [aiSettings],
  );
  const aiConfigured =
    !!aiSettings &&
    !!aiKey.trim() &&
    !!aiSettings.model.trim() &&
    !(aiSettings.providerId === 'custom' && !aiSettings.customBaseUrl.trim());
  const aiImageSupported = aiSettings ? providerSupportsImageInput(aiSettings.providerId) : false;
  const busy = status !== 'idle' || aiStatus === 'running';

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(notificationRef.current);
    notificationRef.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setParams(savedParams ? normalizeRefinementParams(savedParams) : DEFAULT_REFINEMENT_PARAMS);
    setPreset(savedPreset ?? null);
    setPast([]);
    setFuture([]);
    setStatus('idle');
    setError(null);
    setNotice(null);
    setLocalReport(null);
    setAnalysisStatus('idle');
    setAiReport(null);
    setAiStatus('idle');
    setAiError(null);
    setView('split');
    setSplitPosition(50);
    setPreviewBlob(null);
  }, [open, asset, savedParams, savedPreset]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setOriginalPreview(null);
    void createDownscaledDataUrl(asset.blob, PREVIEW_MAX_DIMENSION, 'image/jpeg', 0.9)
      .then((result) => {
        if (!cancelled) {
          setOriginalPreview({ url: result.dataUrl, width: result.width, height: result.height });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('refine.previewError'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, asset, t]);

  useEffect(() => {
    if (!open) {
      return;
    }
    previewControllerRef.current?.abort();
    const controller = new AbortController();
    previewControllerRef.current = controller;
    setStatus('processing');
    const timer = window.setTimeout(() => {
      void refineImage(asset.blob, params, {
        maxDimension: PREVIEW_MAX_DIMENSION,
        format: params.binarize === 'adaptive' ? 'image/png' : 'image/jpeg',
        quality: 0.92,
        signal: controller.signal,
      })
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }
          setPreviewBlob(result.blob);
          setStatus('idle');
        })
        .catch((previewError: unknown) => {
          if (
            controller.signal.aborted ||
            (previewError as { name?: string } | null)?.name === 'AbortError'
          ) {
            return;
          }
          setStatus('idle');
          setError(t('refine.previewError'));
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, asset, params, t]);

  useEffect(() => {
    if (!previewBlob) {
      setPreviewUrl(null);
      return;
    }
    const url = createObjectUrl(previewBlob);
    setPreviewUrl(url);
    return () => revokeObjectUrl(url);
  }, [previewBlob]);

  useEffect(() => {
    return () => {
      previewControllerRef.current?.abort();
      aiControllerRef.current?.abort();
      window.clearTimeout(notificationRef.current);
    };
  }, []);

  const pushHistory = useCallback((baseline: RefinementParams) => {
    setPast((current) => [...current, baseline].slice(-40));
    setFuture([]);
  }, []);

  const commitParams = useCallback(
    (next: RefinementParams, nextPreset: RefinementPresetId | null = null) => {
      if (refinementParamsEqual(next, params) && nextPreset === preset) {
        return;
      }
      pushHistory(params);
      setParams(next);
      setPreset(nextPreset);
    },
    [params, preset, pushHistory],
  );

  const beginEdit = () => {
    sliderBaselineRef.current = params;
  };

  const endEdit = () => {
    const baseline = sliderBaselineRef.current;
    if (!refinementParamsEqual(baseline, params)) {
      pushHistory(baseline);
      setPreset(null);
    }
  };

  const updateParam = <K extends keyof RefinementParams>(key: K, value: RefinementParams[K]) => {
    setParams((current) => normalizeRefinementParams({ ...current, [key]: value }));
  };

  const handleUndo = () => {
    const previous = past[past.length - 1];
    if (!previous) {
      return;
    }
    setParams(previous);
    setPast(past.slice(0, -1));
    setFuture([params, ...future]);
  };

  const handleRedo = () => {
    const next = future[0];
    if (!next) {
      return;
    }
    setParams(next);
    setFuture(future.slice(1));
    setPast([...past, params]);
  };

  const handleApplyPreset = (presetId: RefinementPresetId) => {
    commitParams(
      normalizeRefinementParams({ ...DEFAULT_REFINEMENT_PARAMS, ...getPresetParams(presetId) }),
      presetId,
    );
  };

  const runLocalAnalysis = async (apply: boolean) => {
    if (busy || analysisStatus === 'running') {
      return;
    }
    setAnalysisStatus('running');
    setError(null);
    setNotice(null);
    try {
      const buffer = await decodeImageBlob(asset.blob);
      const { buffer: scaled } = resizeBuffer(buffer, ANALYSIS_MAX_DIMENSION, 1_200_000);
      const { report, params: suggested } = suggestAutoRefine(scaled);
      setLocalReport(report);
      if (apply) {
        commitParams(suggested, report.recommendedPreset);
        showNotice(t('refine.autoApplied'));
      }
    } catch {
      setError(t('refine.analysisError'));
    } finally {
      setAnalysisStatus('idle');
    }
  };

  const runAi = async (mode: 'analysis' | 'enhancement') => {
    if (!aiSettings || !aiConfigured) {
      setAiError('not-configured');
      return;
    }
    if (!aiImageSupported) {
      setAiError('bad-request');
      return;
    }
    aiControllerRef.current?.abort();
    const controller = new AbortController();
    aiControllerRef.current = controller;
    setAiStatus('running');
    setAiError(null);
    try {
      const { dataUrl } = await createDownscaledDataUrl(
        asset.blob,
        AI_MAX_DIMENSION,
        'image/jpeg',
        0.85,
      );
      const report = await requestAiImageRefinement({
        settings: aiSettings,
        apiKey: aiKey.trim(),
        image: { dataUrl, mimeType: 'image/jpeg' },
        mode,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setAiReport(report);
      setAiStatus('done');
      if (mode === 'enhancement') {
        commitParams(mergeAiRefinementParams(params, report), report.recommendedPreset);
        showNotice(t('refine.aiApplied'));
      }
    } catch (requestError) {
      if (requestError instanceof AiError && requestError.code === 'cancelled') {
        setAiStatus('idle');
        return;
      }
      setAiStatus('error');
      setAiError(requestError instanceof AiError ? requestError.code : 'unknown');
    }
  };

  const handleApply = async () => {
    if (busy) {
      return;
    }
    setStatus('applying');
    setError(null);
    try {
      const result = await refineImage(asset.blob, params, {
        maxDimension: FULL_MAX_DIMENSION,
        maxPixels: FULL_MAX_PIXELS,
        format: params.binarize === 'adaptive' ? 'image/png' : 'image/jpeg',
        quality: 0.95,
      });
      await onApply({
        blob: result.blob,
        width: result.width,
        height: result.height,
        preset,
        params,
      });
    } catch {
      setError(t('refine.applyError'));
    } finally {
      setStatus('idle');
    }
  };

  const handleRevert = async () => {
    if (busy || !hasSavedRefinement) {
      return;
    }
    setStatus('applying');
    setError(null);
    try {
      await onRevert();
      setParams(DEFAULT_REFINEMENT_PARAMS);
      setPreset(null);
      setPast([]);
      setFuture([]);
      setAiReport(null);
      showNotice(t('refine.reverted'));
    } catch {
      setError(t('refine.revertError'));
    } finally {
      setStatus('idle');
    }
  };

  const handleClose = () => {
    previewControllerRef.current?.abort();
    aiControllerRef.current?.abort();
    onClose();
  };

  const aspectStyle = originalPreview
    ? { aspectRatio: `${originalPreview.width} / ${originalPreview.height}` }
    : undefined;

  const footer = (
    <>
      <Button variant="ghost" onClick={handleClose} disabled={status === 'applying'}>
        {t('common.cancel')}
      </Button>
      <Button variant="primary" onClick={() => void handleApply()} disabled={busy || !previewBlob}>
        {status === 'applying' ? t('refine.applying') : t('refine.apply')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      className={styles.dialog}
      title={t('refine.title')}
      description={t('refine.description')}
      onClose={handleClose}
      footer={footer}
    >
      <div className={styles.body}>
        <div className={styles.toolbar} role="toolbar" aria-label={t('refine.title')}>
          <div className={styles.toolbarGroup}>
            {(['document', 'handwriting', 'old-scan', 'camera', 'low-contrast'] as const).map(
              (presetId) => (
                <Button
                  key={presetId}
                  variant={preset === presetId ? 'secondary' : 'ghost'}
                  size="sm"
                  disabled={busy}
                  aria-pressed={preset === presetId}
                  onClick={() => handleApplyPreset(presetId)}
                >
                  {t(PRESET_LABEL_KEYS[presetId])}
                </Button>
              ),
            )}
          </div>
          <div className={styles.toolbarGroup}>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || analysisStatus === 'running'}
              onClick={() => void runLocalAnalysis(true)}
            >
              <Wand2 size={15} aria-hidden="true" />
              {t('refine.autoRefine')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || analysisStatus === 'running'}
              aria-busy={analysisStatus === 'running'}
              onClick={() => void runLocalAnalysis(false)}
            >
              <Eye size={15} aria-hidden="true" />
              {analysisStatus === 'running' ? t('refine.analyzing') : t('refine.analyze')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              disabled={busy || past.length === 0}
              aria-label={t('refine.undo')}
              title={t('refine.undo')}
              onClick={handleUndo}
            >
              <Undo2 size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              disabled={busy || future.length === 0}
              aria-label={t('refine.redo')}
              title={t('refine.redo')}
              onClick={handleRedo}
            >
              <Redo2 size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => commitParams(DEFAULT_REFINEMENT_PARAMS, null)}
            >
              {t('refine.reset')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || !hasSavedRefinement}
              onClick={() => void handleRevert()}
              title={t('refine.revertHint')}
            >
              {t('refine.revert')}
            </Button>
          </div>
        </div>

        {hasSavedRefinement ? <p className={styles.hint}>{t('refine.existingVersion')}</p> : null}

        {error ? (
          <p className={styles.alert} role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}

        {analysisStatus === 'running' || localReport ? (
          <section
            className={styles.analysisPanel}
            aria-labelledby="refine-analysis-heading"
            aria-busy={analysisStatus === 'running'}
          >
            <h3 id="refine-analysis-heading" className={styles.sectionTitle}>
              {t('refine.analysisTitle')}
            </h3>
            {analysisStatus === 'running' && !localReport ? (
              <p className={styles.hint} role="status">
                {t('refine.analyzing')}
              </p>
            ) : null}
            {localReport ? (
              <>
                <dl className={styles.metrics}>
                  <div className={styles.metric}>
                    <dt>{t('refine.metricBrightness')}</dt>
                    <dd>{localReport.brightness}</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt>{t('refine.metricContrast')}</dt>
                    <dd>{localReport.contrast}</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt>{t('refine.metricSharpness')}</dt>
                    <dd>{localReport.sharpness}</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt>{t('refine.metricNoise')}</dt>
                    <dd>{localReport.noise}</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt>{t('refine.metricSkew')}</dt>
                    <dd>{localReport.skewDegrees.toFixed(1)}°</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt>{t('refine.metricLighting')}</dt>
                    <dd>{localReport.backgroundVariation}</dd>
                  </div>
                </dl>
                <IssueList issues={localReport.issues} t={t} />
                <p className={styles.hint}>{t('refine.analyzeHint')}</p>
              </>
            ) : null}
          </section>
        ) : null}

        <div className={styles.grid}>
          <div className={styles.previewColumn}>
            <div className={styles.viewSwitch} role="group" aria-label={t('refine.compare')}>
              {(['before', 'split', 'after'] as const).map((option) => (
                <Button
                  key={option}
                  variant={view === option ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                >
                  {option === 'before'
                    ? t('refine.before')
                    : option === 'after'
                      ? t('refine.after')
                      : t('refine.split')}
                </Button>
              ))}
            </div>

            <div className={styles.compareStage} style={aspectStyle}>
              {originalPreview ? (
                <img
                  className={styles.compareImage}
                  src={originalPreview.url}
                  alt={t('refine.before')}
                />
              ) : null}
              {previewUrl && view !== 'before' ? (
                <img
                  className={clsx(
                    styles.compareImage,
                    styles.compareImageOverlay,
                    view === 'after' && styles.compareImageFull,
                  )}
                  style={
                    view === 'split' ? { clipPath: `inset(0 0 0 ${splitPosition}%)` } : undefined
                  }
                  src={previewUrl}
                  alt={t('refine.after')}
                />
              ) : null}
              {status === 'processing' ? (
                <span className={styles.processingBadge} role="status">
                  {t('refine.processing')}
                </span>
              ) : null}
            </div>

            {view === 'split' ? (
              <div className={styles.compareControl}>
                <input
                  className={styles.range}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={splitPosition}
                  aria-label={t('refine.comparePosition')}
                  onChange={(event) => setSplitPosition(Number(event.target.value))}
                />
              </div>
            ) : null}

            <p className={styles.hint}>{t('refine.previewNote')}</p>
            <p className={styles.hint}>{t('refine.originalPreserved')}</p>
          </div>

          <div className={styles.controlsColumn}>
            <section className={styles.section} aria-labelledby="refine-geometry-heading">
              <h3 id="refine-geometry-heading" className={styles.sectionTitle}>
                {t('refine.geometrySection')}
              </h3>
              <div className={styles.toolbarGroup}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={t('refine.rotateLeft')}
                  title={t('refine.rotateLeft')}
                  onClick={() =>
                    commitParams({
                      ...params,
                      rotation: clamp(params.rotation - 90, -180, 180),
                    })
                  }
                >
                  <RotateCcw size={16} aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={t('refine.rotateRight')}
                  title={t('refine.rotateRight')}
                  onClick={() =>
                    commitParams({
                      ...params,
                      rotation: clamp(params.rotation + 90, -180, 180),
                    })
                  }
                >
                  <RotateCw size={16} aria-hidden="true" />
                </Button>
              </div>
              <Slider
                id="refine-rotation"
                label={t('refine.rotation')}
                value={params.rotation}
                min={-180}
                max={180}
                disabled={busy}
                onBegin={beginEdit}
                onEnd={endEdit}
                onChange={(value) => updateParam('rotation', value)}
              />
              <Toggle
                id="refine-deskew"
                label={t('refine.deskew')}
                checked={params.deskew}
                disabled={busy}
                hint={t('refine.deskewHint')}
                onChange={(checked) => commitParams({ ...params, deskew: checked })}
              />
              <Toggle
                id="refine-perspective"
                label={t('refine.perspective')}
                checked={params.perspective !== null}
                disabled={busy}
                onChange={(checked) =>
                  commitParams({
                    ...params,
                    perspective: checked ? createDefaultPerspectiveQuad() : null,
                  })
                }
              />
              {params.perspective ? (
                <>
                  <PerspectiveEditor
                    imageUrl={originalPreview?.url ?? ''}
                    aspectRatio={
                      originalPreview
                        ? `${originalPreview.width} / ${originalPreview.height}`
                        : undefined
                    }
                    quad={params.perspective}
                    disabled={busy}
                    onChange={(quad) => updateParam('perspective', quad)}
                    onCommit={() => pushHistory(params)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      commitParams({ ...params, perspective: createDefaultPerspectiveQuad() })
                    }
                  >
                    {t('refine.resetCorners')}
                  </Button>
                </>
              ) : (
                <p className={styles.hint}>{t('refine.perspectiveHint')}</p>
              )}
            </section>

            <section className={styles.section} aria-labelledby="refine-tone-heading">
              <h3 id="refine-tone-heading" className={styles.sectionTitle}>
                {t('refine.toneSection')}
              </h3>
              <Toggle
                id="refine-auto-enhance"
                label={t('refine.autoEnhance')}
                checked={params.autoEnhance}
                disabled={busy}
                hint={t('refine.autoEnhanceHint')}
                onChange={(checked) => commitParams({ ...params, autoEnhance: checked })}
              />
              <Slider
                id="refine-brightness"
                label={t('refine.brightness')}
                value={params.brightness}
                min={-100}
                max={100}
                disabled={busy}
                onBegin={beginEdit}
                onEnd={endEdit}
                onChange={(value) => updateParam('brightness', value)}
              />
              <Slider
                id="refine-contrast"
                label={t('refine.contrast')}
                value={params.contrast}
                min={-100}
                max={100}
                disabled={busy}
                onBegin={beginEdit}
                onEnd={endEdit}
                onChange={(value) => updateParam('contrast', value)}
              />
              <Toggle
                id="refine-shadow"
                label={t('refine.shadowRemoval')}
                checked={params.shadowRemoval}
                disabled={busy}
                hint={t('refine.shadowRemovalHint')}
                onChange={(checked) => commitParams({ ...params, shadowRemoval: checked })}
              />
            </section>

            <section className={styles.section} aria-labelledby="refine-detail-heading">
              <h3 id="refine-detail-heading" className={styles.sectionTitle}>
                {t('refine.detailSection')}
              </h3>
              <Slider
                id="refine-denoise"
                label={t('refine.denoise')}
                value={params.denoise}
                min={0}
                max={100}
                disabled={busy}
                onBegin={beginEdit}
                onEnd={endEdit}
                onChange={(value) => updateParam('denoise', value)}
              />
              <Slider
                id="refine-sharpen"
                label={t('refine.sharpen')}
                value={params.sharpen}
                min={0}
                max={100}
                disabled={busy}
                hint={t('refine.sharpenHint')}
                onBegin={beginEdit}
                onEnd={endEdit}
                onChange={(value) => updateParam('sharpen', value)}
              />
              <Toggle
                id="refine-grayscale"
                label={t('refine.grayscale')}
                checked={params.grayscale}
                disabled={busy}
                onChange={(checked) => commitParams({ ...params, grayscale: checked })}
              />
              <div className={styles.control}>
                <label className={styles.controlLabel} htmlFor="refine-binarize">
                  {t('refine.binarize')}
                </label>
                <select
                  id="refine-binarize"
                  className={formStyles.select}
                  value={params.binarize}
                  disabled={busy}
                  onChange={(event) =>
                    commitParams({
                      ...params,
                      binarize: event.target.value === 'adaptive' ? 'adaptive' : 'none',
                    })
                  }
                >
                  <option value="none">{t('refine.binarizeNone')}</option>
                  <option value="adaptive">{t('refine.binarizeAdaptive')}</option>
                </select>
              </div>
              <Slider
                id="refine-threshold"
                label={t('refine.threshold')}
                value={params.threshold}
                min={0}
                max={100}
                disabled={busy || params.binarize !== 'adaptive'}
                hint={t('refine.thresholdHint')}
                onBegin={beginEdit}
                onEnd={endEdit}
                onChange={(value) => updateParam('threshold', value)}
              />
              <Toggle
                id="refine-dewarp"
                label={t('refine.dewarp')}
                checked={params.dewarp}
                disabled={busy}
                hint={t('refine.dewarpHint')}
                onChange={(checked) => commitParams({ ...params, dewarp: checked })}
              />
            </section>

            <section className={styles.section} aria-labelledby="refine-ai-heading">
              <h3 id="refine-ai-heading" className={styles.sectionTitle}>
                {t('refine.aiSection')}
              </h3>
              {!aiConfigured ? (
                <div className={formStyles.alert} role="status">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{t('refine.aiNotConfigured')}</span>
                  <Button variant="ghost" size="sm" onClick={onOpenSettings}>
                    {t('assistant.openSettings')}
                  </Button>
                </div>
              ) : null}
              {aiConfigured && !aiImageSupported ? (
                <p className={formStyles.alert} role="status">
                  {t('refine.aiImageUnsupported')}
                </p>
              ) : null}
              <div className={styles.toolbarGroup}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !aiConfigured || !aiImageSupported}
                  onClick={() => void runAi('analysis')}
                >
                  <Eye size={15} aria-hidden="true" />
                  {t('refine.aiAnalyze')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !aiConfigured || !aiImageSupported}
                  onClick={() => void runAi('enhancement')}
                >
                  <Wand2 size={15} aria-hidden="true" />
                  {t('refine.aiEnhance')}
                </Button>
              </div>
              {aiStatus === 'running' ? (
                <p className={styles.hint} role="status">
                  {t('refine.aiRunning')}
                </p>
              ) : null}
              {aiError ? (
                <p className={formStyles.alert} role="alert">
                  {t(aiErrorKey(aiError))}
                </p>
              ) : null}
              {aiReport ? (
                <div className={styles.aiResult}>
                  {aiReport.summary ? <p className={styles.aiSummary}>{aiReport.summary}</p> : null}
                  <IssueList issues={aiReport.issues} t={t} />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      commitParams(
                        mergeAiRefinementParams(params, aiReport),
                        aiReport.recommendedPreset,
                      );
                      showNotice(t('refine.aiApplied'));
                    }}
                  >
                    <Sparkles size={15} aria-hidden="true" />
                    {t('refine.aiApplySuggestions')}
                  </Button>
                </div>
              ) : null}
              <p className={styles.hint}>{t('refine.aiPrivacy')}</p>
            </section>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
