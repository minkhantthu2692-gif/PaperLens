import {
  DEFAULT_REFINEMENT_PARAMS,
  type RefinementParams,
  type RefinementPresetId,
} from '@/domain/refinement';

/**
 * Presets are starting points, not automatic decisions. They avoid aggressive
 * binarization by default so handwriting and faint characters stay intact.
 */
export const REFINEMENT_PRESETS: Record<RefinementPresetId, RefinementParams> = {
  document: {
    ...DEFAULT_REFINEMENT_PARAMS,
    autoEnhance: true,
    deskew: true,
    shadowRemoval: true,
    denoise: 15,
    contrast: 10,
    sharpen: 25,
    threshold: 50,
  },
  handwriting: {
    ...DEFAULT_REFINEMENT_PARAMS,
    autoEnhance: true,
    deskew: true,
    shadowRemoval: true,
    denoise: 8,
    contrast: 12,
    sharpen: 10,
    threshold: 55,
  },
  'old-scan': {
    ...DEFAULT_REFINEMENT_PARAMS,
    autoEnhance: true,
    deskew: true,
    shadowRemoval: true,
    denoise: 35,
    contrast: 20,
    sharpen: 30,
    grayscale: true,
    threshold: 55,
  },
  camera: {
    ...DEFAULT_REFINEMENT_PARAMS,
    autoEnhance: true,
    deskew: true,
    shadowRemoval: true,
    denoise: 30,
    contrast: 15,
    sharpen: 25,
    threshold: 50,
  },
  'low-contrast': {
    ...DEFAULT_REFINEMENT_PARAMS,
    autoEnhance: true,
    deskew: true,
    shadowRemoval: true,
    denoise: 10,
    brightness: 5,
    contrast: 35,
    grayscale: true,
    sharpen: 15,
    threshold: 60,
  },
};

export const REFINEMENT_PRESET_IDS: RefinementPresetId[] = [
  'document',
  'handwriting',
  'old-scan',
  'camera',
  'low-contrast',
];

export function getPresetParams(preset: RefinementPresetId): RefinementParams {
  return { ...REFINEMENT_PRESETS[preset] };
}
