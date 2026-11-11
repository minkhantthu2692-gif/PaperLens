/**
 * Image refinement domain model.
 *
 * Refinement is always non-destructive: parameters describe a deterministic,
 * on-device pipeline that is applied to a copy of the original image. The
 * original asset is never modified or replaced.
 */

export interface RefinePoint {
  /** Normalized horizontal position (0 = left edge, 1 = right edge). */
  x: number;
  /** Normalized vertical position (0 = top edge, 1 = bottom edge). */
  y: number;
}

export interface PerspectiveQuad {
  topLeft: RefinePoint;
  topRight: RefinePoint;
  bottomRight: RefinePoint;
  bottomLeft: RefinePoint;
}

export type BinarizationMode = 'none' | 'adaptive';

export interface RefinementParams {
  /** Automatic levels (contrast stretch based on the luminance histogram). */
  autoEnhance: boolean;
  /** Manual rotation in degrees (−180…180). */
  rotation: number;
  /** Automatic skew detection and straightening. */
  deskew: boolean;
  /** Corner quad for perspective correction, or null when disabled. */
  perspective: PerspectiveQuad | null;
  /** Median-style noise reduction strength (0…100). */
  denoise: number;
  /** Brightness adjustment (−100…100). */
  brightness: number;
  /** Contrast adjustment (−100…100). */
  contrast: number;
  /** Convert to grayscale. */
  grayscale: boolean;
  /** Adaptive threshold (binarization). */
  binarize: BinarizationMode;
  /** Adaptive threshold sensitivity (0…100; higher keeps more ink). */
  threshold: number;
  /** Unsharp-mask sharpening strength (0…100). */
  sharpen: number;
  /** Remove uneven lighting and shadows. */
  shadowRemoval: boolean;
  /** Conservative page dewarping for curved/downturned scans. */
  dewarp: boolean;
}

export type RefinementPresetId =
  'document' | 'handwriting' | 'old-scan' | 'camera' | 'low-contrast';

export const DEFAULT_REFINEMENT_PARAMS: RefinementParams = {
  autoEnhance: false,
  rotation: 0,
  deskew: false,
  perspective: null,
  denoise: 0,
  brightness: 0,
  contrast: 0,
  grayscale: false,
  binarize: 'none',
  threshold: 50,
  sharpen: 0,
  shadowRemoval: false,
  dewarp: false,
};

export type ImageIssueCode =
  | 'low-light'
  | 'over-exposed'
  | 'low-contrast'
  | 'blur'
  | 'noise'
  | 'skew'
  | 'uneven-lighting'
  | 'faint-text'
  | 'curvature'
  | 'perspective'
  | 'handwriting'
  | 'difficult-regions';

export type IssueSeverity = 'low' | 'medium' | 'high';

export interface ImageQualityIssue {
  code: ImageIssueCode;
  severity: IssueSeverity;
  /** Optional measured value the issue is derived from (0…100 unless noted). */
  value?: number;
  /** Optional short explanation (used by AI analysis, never document text). */
  detail?: string;
}

/** Deterministic, on-device measurement of an image. */
export interface ImageQualityReport {
  width: number;
  height: number;
  /** Average luminance (0…100). */
  brightness: number;
  /** Luminance spread (0…100). */
  contrast: number;
  /** Laplacian-variance based sharpness (0…100, higher is sharper). */
  sharpness: number;
  /** Estimated noise level (0…100). */
  noise: number;
  /** Estimated skew in degrees (positive = clockwise). */
  skewDegrees: number;
  /** Share of dark pixels (0…1). */
  darkRatio: number;
  /** 4×4 background brightness variation (0…100). */
  backgroundVariation: number;
  issues: ImageQualityIssue[];
  recommendedPreset: RefinementPresetId;
  recommendedParams: RefinementParams;
}

/** Structured result returned by an AI image analysis or enhancement request. */
export interface AiImageReport {
  summary: string;
  issues: ImageQualityIssue[];
  recommendedPreset: RefinementPresetId | null;
  /** Partial parameter overrides suggested by the provider. */
  recommendations: Partial<RefinementParams>;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function clampPoint(value: unknown, fallback: RefinePoint): RefinePoint {
  if (typeof value !== 'object' || value === null) {
    return { ...fallback };
  }
  const record = value as Record<string, unknown>;
  return {
    x: clampNumber(record['x'], 0, 1, fallback.x),
    y: clampNumber(record['y'], 0, 1, fallback.y),
  };
}

function clampQuad(value: unknown, fallback: PerspectiveQuad | null): PerspectiveQuad | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object') {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  const base = fallback ?? DEFAULT_PERSPECTIVE_QUAD;
  return {
    topLeft: clampPoint(record['topLeft'], base.topLeft),
    topRight: clampPoint(record['topRight'], base.topRight),
    bottomRight: clampPoint(record['bottomRight'], base.bottomRight),
    bottomLeft: clampPoint(record['bottomLeft'], base.bottomLeft),
  };
}

export function createDefaultPerspectiveQuad(inset = 0.02): PerspectiveQuad {
  return {
    topLeft: { x: inset, y: inset },
    topRight: { x: 1 - inset, y: inset },
    bottomRight: { x: 1 - inset, y: 1 - inset },
    bottomLeft: { x: inset, y: 1 - inset },
  };
}

export const DEFAULT_PERSPECTIVE_QUAD: PerspectiveQuad = createDefaultPerspectiveQuad();

/** Normalizes untrusted parameter input (storage, AI output) into valid params. */
export function normalizeRefinementParams(
  value: unknown,
  fallback: RefinementParams = DEFAULT_REFINEMENT_PARAMS,
): RefinementParams {
  if (typeof value !== 'object' || value === null) {
    return { ...fallback };
  }
  const record = value as Record<string, unknown>;
  const binarize = record['binarize'] === 'adaptive' ? 'adaptive' : 'none';
  return {
    autoEnhance:
      typeof record['autoEnhance'] === 'boolean' ? record['autoEnhance'] : fallback.autoEnhance,
    rotation: clampNumber(record['rotation'], -180, 180, fallback.rotation),
    deskew: typeof record['deskew'] === 'boolean' ? record['deskew'] : fallback.deskew,
    perspective: clampQuad(record['perspective'], fallback.perspective),
    denoise: clampNumber(record['denoise'], 0, 100, fallback.denoise),
    brightness: clampNumber(record['brightness'], -100, 100, fallback.brightness),
    contrast: clampNumber(record['contrast'], -100, 100, fallback.contrast),
    grayscale: typeof record['grayscale'] === 'boolean' ? record['grayscale'] : fallback.grayscale,
    binarize,
    threshold: clampNumber(record['threshold'], 0, 100, fallback.threshold),
    sharpen: clampNumber(record['sharpen'], 0, 100, fallback.sharpen),
    shadowRemoval:
      typeof record['shadowRemoval'] === 'boolean'
        ? record['shadowRemoval']
        : fallback.shadowRemoval,
    dewarp: typeof record['dewarp'] === 'boolean' ? record['dewarp'] : fallback.dewarp,
  };
}

function pointsEqual(left: RefinePoint, right: RefinePoint): boolean {
  return Math.abs(left.x - right.x) < 1e-4 && Math.abs(left.y - right.y) < 1e-4;
}

/** Structural comparison used for undo/redo history and change detection. */
export function refinementParamsEqual(left: RefinementParams, right: RefinementParams): boolean {
  const a = normalizeRefinementParams(left);
  const b = normalizeRefinementParams(right);
  const quadEqual =
    a.perspective === null || b.perspective === null
      ? a.perspective === b.perspective
      : pointsEqual(a.perspective.topLeft, b.perspective.topLeft) &&
        pointsEqual(a.perspective.topRight, b.perspective.topRight) &&
        pointsEqual(a.perspective.bottomRight, b.perspective.bottomRight) &&
        pointsEqual(a.perspective.bottomLeft, b.perspective.bottomLeft);

  return (
    quadEqual &&
    a.autoEnhance === b.autoEnhance &&
    Math.abs(a.rotation - b.rotation) < 1e-3 &&
    a.deskew === b.deskew &&
    a.denoise === b.denoise &&
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.grayscale === b.grayscale &&
    a.binarize === b.binarize &&
    a.threshold === b.threshold &&
    a.sharpen === b.sharpen &&
    a.shadowRemoval === b.shadowRemoval &&
    a.dewarp === b.dewarp
  );
}

export function hasActiveRefinement(params: RefinementParams): boolean {
  return !refinementParamsEqual(params, DEFAULT_REFINEMENT_PARAMS);
}

/** Metadata stored with a refined image version so it can be revisited later. */
export interface RefinedImageInfo {
  assetId: string;
  mimeType: string;
  fileName: string;
  size: number;
  width: number;
  height: number;
  appliedAt: number;
  preset: RefinementPresetId | null;
  params: RefinementParams;
}
