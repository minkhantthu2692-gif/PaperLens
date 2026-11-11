import {
  normalizeRefinementParams,
  type ImageQualityReport,
  type RefinementParams,
} from '@/domain/refinement';
import { analyzeImage, estimateSkewAngle } from './analysis';
import {
  adaptiveThresholdBuffer,
  adjustBrightnessContrast,
  autoLevelsBuffer,
  denoiseBuffer,
  dewarpBuffer,
  grayscaleBuffer,
  perspectiveBuffer,
  removeShadowBuffer,
  rotateBuffer,
  sharpenBuffer,
  type ImageBuffer,
} from './filters';

export interface RefinementOutcome {
  buffer: ImageBuffer;
  /** Skew angle that was compensated, in degrees (clockwise). */
  deskewAngle: number;
}

/**
 * Applies the local refinement pipeline in a fixed, predictable order:
 * rotation → deskew → perspective → lighting → tone → grayscale → denoise →
 * sharpen → binarization → dewarping.
 */
export function applyRefinement(buffer: ImageBuffer, params: RefinementParams): RefinementOutcome {
  const safe = normalizeRefinementParams(params);
  let out = buffer;
  let deskewAngle = 0;

  if (safe.rotation !== 0) {
    out = rotateBuffer(out, safe.rotation);
  }
  if (safe.deskew) {
    deskewAngle = estimateSkewAngle(out);
    if (Math.abs(deskewAngle) >= 0.25) {
      out = rotateBuffer(out, -deskewAngle);
    }
  }
  if (safe.perspective) {
    out = perspectiveBuffer(out, safe.perspective);
  }
  if (safe.shadowRemoval) {
    out = removeShadowBuffer(out, 70);
  }
  if (safe.autoEnhance) {
    out = autoLevelsBuffer(out);
  }
  if (safe.brightness !== 0 || safe.contrast !== 0) {
    out = adjustBrightnessContrast(out, safe.brightness, safe.contrast);
  }
  if (safe.grayscale || safe.binarize === 'adaptive') {
    out = grayscaleBuffer(out);
  }
  if (safe.denoise > 0) {
    out = denoiseBuffer(out, safe.denoise);
  }
  if (safe.sharpen > 0) {
    out = sharpenBuffer(out, safe.sharpen);
  }
  if (safe.binarize === 'adaptive') {
    out = adaptiveThresholdBuffer(out, safe.threshold);
  }
  if (safe.dewarp) {
    out = dewarpBuffer(out);
  }

  return { buffer: out, deskewAngle };
}

export interface AutoRefineResult {
  report: ImageQualityReport;
  params: RefinementParams;
}

/**
 * Deterministic "Auto refine": measures the image on-device and returns the
 * suggested parameters. No AI provider or API key is involved.
 */
export function suggestAutoRefine(buffer: ImageBuffer): AutoRefineResult {
  const report = analyzeImage(buffer);
  return { report, params: report.recommendedParams };
}
