import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFINEMENT_PARAMS,
  refinementParamsEqual,
  type RefinementParams,
} from '@/domain/refinement';
import {
  adaptiveThresholdBuffer,
  adjustBrightnessContrast,
  createBuffer,
  dewarpBuffer,
  grayscaleBuffer,
  luminanceArray,
  perspectiveBuffer,
  resizeBuffer,
  rotateBuffer,
  type ImageBuffer,
} from './filters';
import { analyzeImage, estimateSkewAngle } from './analysis';
import { applyRefinement, suggestAutoRefine } from './pipeline';
import { getPresetParams } from './presets';

function makeBuffer(width: number, height: number, fill = 255): ImageBuffer {
  const buffer = createBuffer(width, height);
  buffer.data.fill(fill);
  return buffer;
}

function setPixel(buffer: ImageBuffer, x: number, y: number, value: number): void {
  const index = (y * buffer.width + x) * 4;
  buffer.data[index] = value;
  buffer.data[index + 1] = value;
  buffer.data[index + 2] = value;
  buffer.data[index + 3] = 255;
}

function drawLine(
  buffer: ImageBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness = 2,
  value = 20,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    for (let dy = 0; dy < thickness; dy += 1) {
      if (x >= 0 && x < buffer.width && y + dy >= 0 && y + dy < buffer.height) {
        setPixel(buffer, x, y + dy, value);
      }
    }
  }
}

/** White page with dark horizontal text-like lines. */
function makeTextPage(width = 240, height = 160): ImageBuffer {
  const buffer = makeBuffer(width, height);
  for (let y = 18; y < height - 12; y += 14) {
    drawLine(buffer, 16, y, width - 16, y, 3, 15);
  }
  return buffer;
}

describe('image filters', () => {
  it('creates buffers and converts to grayscale using luminance', () => {
    const buffer = createBuffer(2, 1);
    buffer.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
    const gray = grayscaleBuffer(buffer);
    expect(gray.data[0]).toBe(Math.round(0.299 * 255));
    expect(gray.data[4]).toBe(Math.round(0.114 * 255));
    expect(luminanceArray(gray)[0]).toBeCloseTo(76.2, 0);
  });

  it('resizes to the requested longest edge and reports the scale', () => {
    const buffer = createBuffer(1000, 500);
    const { buffer: resized, scale } = resizeBuffer(buffer, 250);
    expect(resized.width).toBe(250);
    expect(resized.height).toBe(125);
    expect(scale).toBeCloseTo(0.25, 5);
  });

  it('rotates exact quarter turns while swapping dimensions', () => {
    const buffer = createBuffer(3, 2);
    buffer.data.fill(255);
    setPixel(buffer, 0, 0, 0);
    const rotated = rotateBuffer(buffer, 90);
    expect(rotated.width).toBe(2);
    expect(rotated.height).toBe(3);
    // Top-left pixel moves to the top-right corner after a clockwise turn.
    expect(rotated.data[(0 * rotated.width + 1) * 4]).toBe(0);

    const back = rotateBuffer(rotated, -90);
    expect(back.width).toBe(3);
    expect(back.height).toBe(2);
    expect(back.data[0]).toBe(0);
  });

  it('rotates arbitrary angles inside an expanded canvas', () => {
    const buffer = makeTextPage(80, 60);
    const rotated = rotateBuffer(buffer, 10);
    expect(rotated.width).toBeGreaterThan(80);
    expect(rotated.height).toBeGreaterThan(60);
    expect(rotated.data).toHaveLength(rotated.width * rotated.height * 4);
  });

  it('adjusts brightness and contrast symmetrically', () => {
    const buffer = createBuffer(2, 1);
    buffer.data.set([100, 100, 100, 255, 200, 200, 200, 255]);
    const brighter = adjustBrightnessContrast(buffer, 20, 0);
    expect(brighter.data[0]).toBeGreaterThan(100);
    expect(brighter.data[4]).toBeGreaterThan(200);

    const darker = adjustBrightnessContrast(buffer, -20, 0);
    expect(darker.data[0]).toBeLessThan(100);
  });

  it('produces only black and white pixels when binarizing', () => {
    const buffer = makeTextPage(120, 90);
    const binarized = adaptiveThresholdBuffer(buffer, 55);
    const unique = new Set<number>();
    for (let index = 0; index < binarized.data.length; index += 4) {
      unique.add(binarized.data[index] ?? 0);
    }
    expect([...unique].every((value) => value === 0 || value === 255)).toBe(true);
    expect(unique.size).toBe(2);
  });

  it('keeps the identity perspective quad at roughly the original size', () => {
    const buffer = makeTextPage(120, 80);
    const warped = perspectiveBuffer(buffer, {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomRight: { x: 1, y: 1 },
      bottomLeft: { x: 0, y: 1 },
    });
    expect(Math.abs(warped.width - 120)).toBeLessThanOrEqual(1);
    expect(Math.abs(warped.height - 80)).toBeLessThanOrEqual(1);
  });

  it('does not distort a page without curvature when dewarping', () => {
    const buffer = makeTextPage(160, 120);
    const dewarped = dewarpBuffer(buffer);
    expect(dewarped.width).toBe(buffer.width);
    expect(dewarped.height).toBe(buffer.height);
    let difference = 0;
    let samples = 0;
    for (let index = 0; index < buffer.data.length; index += 4) {
      difference += Math.abs((buffer.data[index] ?? 0) - (dewarped.data[index] ?? 0));
      samples += 1;
    }
    expect(difference / samples).toBeLessThan(6);
  });
});

describe('local image analysis', () => {
  it('estimates skew close to the applied rotation', () => {
    const page = makeTextPage(240, 160);
    const tilted = rotateBuffer(page, 5);
    const angle = estimateSkewAngle(tilted);
    expect(angle).toBeGreaterThan(3.5);
    expect(angle).toBeLessThan(6.5);
    expect(Math.abs(estimateSkewAngle(page))).toBeLessThan(1);
  });

  it('reports a low-contrast wash-out as an issue', () => {
    const page = makeTextPage(200, 140);
    const washed = adjustBrightnessContrast(page, 40, -95);
    const report = analyzeImage(washed);
    expect(report.contrast).toBeLessThan(35);
    expect(report.issues.some((issue) => issue.code === 'low-contrast')).toBe(true);
    expect(report.recommendedPreset).toBe('low-contrast');
  });

  it('detects a sharp, well-lit document without low-contrast issues', () => {
    const report = analyzeImage(makeTextPage(240, 160));
    expect(report.brightness).toBeGreaterThan(60);
    expect(report.issues.some((issue) => issue.code === 'low-contrast')).toBe(false);
    expect(report.recommendedParams.autoEnhance).toBe(true);
  });

  it('suggests auto-refine parameters derived from the measurement', () => {
    const { report, params } = suggestAutoRefine(makeTextPage(200, 140));
    expect(report.recommendedParams).toEqual(params);
    expect(Number.isFinite(params.contrast)).toBe(true);
  });
});

describe('refinement pipeline', () => {
  it('leaves the source buffer untouched and applies rotation', () => {
    const source = makeTextPage(100, 80);
    const copy = new Uint8ClampedArray(source.data);
    const params: RefinementParams = { ...DEFAULT_REFINEMENT_PARAMS, rotation: 90 };
    const outcome = applyRefinement(source, params);
    expect(outcome.buffer.width).toBe(80);
    expect(outcome.buffer.height).toBe(100);
    expect(source.data).toEqual(copy);
  });

  it('compensates a detected skew and keeps dimensions reasonable', () => {
    const tilted = rotateBuffer(makeTextPage(240, 160), 4);
    const outcome = applyRefinement(tilted, {
      ...DEFAULT_REFINEMENT_PARAMS,
      deskew: true,
    });
    expect(Math.abs(outcome.deskewAngle)).toBeGreaterThan(2);
    expect(outcome.buffer.width).toBeGreaterThan(0);
    expect(outcome.buffer.height).toBeGreaterThan(0);
  });

  it('runs every stage together without throwing', () => {
    const params: RefinementParams = {
      ...getPresetParams('old-scan'),
      binarize: 'adaptive',
      dewarp: true,
      perspective: {
        topLeft: { x: 0.02, y: 0.02 },
        topRight: { x: 0.98, y: 0.03 },
        bottomRight: { x: 0.97, y: 0.97 },
        bottomLeft: { x: 0.03, y: 0.98 },
      },
    };
    const outcome = applyRefinement(makeTextPage(160, 120), params);
    expect(outcome.buffer.data.length).toBe(outcome.buffer.width * outcome.buffer.height * 4);
    expect(outcome.buffer.width).toBeLessThan(160);
  });

  it('normalizes and compares parameters structurally', () => {
    const normalized = refinementParamsEqual(
      { ...DEFAULT_REFINEMENT_PARAMS, rotation: 900, denoise: -50 },
      DEFAULT_REFINEMENT_PARAMS,
    );
    expect(normalized).toBe(false);
    expect(
      refinementParamsEqual(
        { ...DEFAULT_REFINEMENT_PARAMS },
        { ...DEFAULT_REFINEMENT_PARAMS, rotation: 0 },
      ),
    ).toBe(true);
  });
});
