import type {
  ImageQualityIssue,
  ImageQualityReport,
  RefinementParams,
  RefinementPresetId,
} from '@/domain/refinement';
import { DEFAULT_REFINEMENT_PARAMS } from '@/domain/refinement';
import { grayscaleBuffer, luminanceArray, resizeBuffer, type ImageBuffer } from './filters';
import { getPresetParams } from './presets';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentile(histogram: Uint32Array, total: number, ratio: number): number {
  const target = Math.max(1, total * ratio);
  let accumulated = 0;
  for (let value = 0; value < 256; value += 1) {
    accumulated += histogram[value] ?? 0;
    if (accumulated >= target) {
      return value;
    }
  }
  return 255;
}

/**
 * Estimates how far the text baselines are rotated clockwise (degrees).
 * The value is measured by maximising the variance of the horizontal
 * projection profile across candidate angles. Straighten the page by rotating
 * the content counter-clockwise, i.e. `rotateBuffer(buffer, -angle)`.
 */
export function estimateSkewAngle(buffer: ImageBuffer, range = 10, coarseStep = 0.5): number {
  const { buffer: scaled } = resizeBuffer(buffer, 480, 240_000);
  const gray = luminanceArray(grayscaleBuffer(scaled));
  const { width, height } = scaled;
  if (width < 16 || height < 16) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < gray.length; index += 1) {
    total += gray[index] ?? 0;
  }
  const mean = total / gray.length;
  const threshold = Math.min(mean * 0.92, mean - 4);

  const points: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((gray[y * width + x] ?? 255) < threshold) {
        points.push(x, y);
      }
      if (points.length >= 240_000) {
        break;
      }
    }
  }
  if (points.length < 60) {
    return 0;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const bins = Math.ceil(height * 1.6);
  const offset = Math.floor(bins / 2);

  const score = (degrees: number): number => {
    const radians = (degrees * Math.PI) / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const sums = new Float32Array(bins);
    for (let index = 0; index < points.length; index += 2) {
      const dx = (points[index] as number) - centerX;
      const dy = (points[index + 1] as number) - centerY;
      const rotated = -sin * dx + cos * dy;
      const bin = Math.round(rotated) + offset;
      if (bin >= 0 && bin < bins) {
        sums[bin] = (sums[bin] as number) + 1;
      }
    }
    let sum = 0;
    let sumSquares = 0;
    for (let index = 0; index < bins; index += 1) {
      const value = sums[index] as number;
      sum += value;
      sumSquares += value * value;
    }
    return sumSquares / Math.max(1, sum);
  };

  let best = 0;
  let bestScore = -1;
  for (let angle = -range; angle <= range + 1e-9; angle += coarseStep) {
    const value = score(angle);
    if (value > bestScore) {
      bestScore = value;
      best = angle;
    }
  }
  let refined = best;
  for (let angle = best - coarseStep; angle <= best + coarseStep + 1e-9; angle += coarseStep / 4) {
    const value = score(angle);
    if (value > bestScore) {
      bestScore = value;
      refined = angle;
    }
  }
  return Math.abs(refined) < 0.2 ? 0 : Number(refined.toFixed(2));
}

function medianOf9(
  gray: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const values: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    const sampleY = clamp(y + dy, 0, height - 1);
    for (let dx = -1; dx <= 1; dx += 1) {
      const sampleX = clamp(x + dx, 0, width - 1);
      values.push(gray[sampleY * width + sampleX] ?? 0);
    }
  }
  values.sort((left, right) => left - right);
  return values[4] ?? 0;
}

export function analyzeImage(buffer: ImageBuffer): ImageQualityReport {
  const { buffer: scaled } = resizeBuffer(buffer, 512, 360_000);
  const gray = luminanceArray(grayscaleBuffer(scaled));
  const { width, height } = scaled;
  const pixelCount = width * height;

  let sum = 0;
  let sumSquares = 0;
  let dark = 0;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixelCount; index += 1) {
    const value = gray[index] ?? 0;
    sum += value;
    sumSquares += value * value;
    if (value < 128) {
      dark += 1;
    }
    const bin = Math.round(value);
    histogram[bin] = (histogram[bin] ?? 0) + 1;
  }
  const mean = sum / Math.max(1, pixelCount);
  const variance = Math.max(0, sumSquares / Math.max(1, pixelCount) - mean * mean);
  const standardDeviation = Math.sqrt(variance);

  // Laplacian variance as a sharpness proxy.
  let lapSum = 0;
  let lapSquares = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const value =
        4 * (gray[index] as number) -
        (gray[index - 1] as number) -
        (gray[index + 1] as number) -
        (gray[index - width] as number) -
        (gray[index + width] as number);
      lapSum += value;
      lapSquares += value * value;
      lapCount += 1;
    }
  }
  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const lapVariance = Math.max(0, (lapCount > 0 ? lapSquares / lapCount : 0) - lapMean * lapMean);
  const sharpness = clamp(Math.sqrt(lapVariance) / 0.6, 0, 100);

  // Robust noise estimate: median absolute deviation from a 3×3 median.
  const sampleStep = Math.max(1, Math.floor(Math.sqrt(pixelCount / 4000)));
  const differences: number[] = [];
  for (let y = 1; y < height - 1; y += sampleStep) {
    for (let x = 1; x < width - 1; x += sampleStep) {
      const value = gray[y * width + x] ?? 0;
      differences.push(Math.abs(value - medianOf9(gray, width, height, x, y)));
    }
  }
  differences.sort((left, right) => left - right);
  const medianDifference = differences[Math.floor(differences.length / 2)] ?? 0;
  const noise = clamp((medianDifference / 10) * 100, 0, 100);

  // Background variation across a 4×4 grid (uneven lighting / shadows).
  const blockLuminance: number[] = [];
  const blockWidth = Math.max(1, Math.floor(width / 4));
  const blockHeight = Math.max(1, Math.floor(height / 4));
  for (let blockY = 0; blockY < height; blockY += blockHeight) {
    for (let blockX = 0; blockX < width; blockX += blockWidth) {
      const blockHistogram = new Uint32Array(256);
      let blockTotal = 0;
      for (let y = blockY; y < Math.min(height, blockY + blockHeight); y += 1) {
        for (let x = blockX; x < Math.min(width, blockX + blockWidth); x += 1) {
          const bin = Math.round(gray[y * width + x] ?? 0);
          blockHistogram[bin] = (blockHistogram[bin] ?? 0) + 1;
          blockTotal += 1;
        }
      }
      if (blockTotal > 0) {
        blockLuminance.push(percentile(blockHistogram, blockTotal, 0.85));
      }
    }
  }
  const backgroundVariation =
    blockLuminance.length > 1
      ? clamp(Math.max(...blockLuminance) - Math.min(...blockLuminance), 0, 100)
      : 0;

  const skewDegrees = estimateSkewAngle(scaled);
  const brightness = clamp((mean / 255) * 100, 0, 100);
  const contrast = clamp((standardDeviation / 64) * 100, 0, 100);
  const darkRatio = dark / Math.max(1, pixelCount);
  const faint = percentile(histogram, pixelCount, 0.5);

  const issues: ImageQualityIssue[] = [];
  if (brightness < 30) {
    issues.push({ code: 'low-light', severity: brightness < 20 ? 'high' : 'medium' });
  } else if (brightness > 88) {
    issues.push({ code: 'over-exposed', severity: brightness > 94 ? 'high' : 'medium' });
  }
  if (contrast < 30) {
    issues.push({ code: 'low-contrast', severity: contrast < 18 ? 'high' : 'medium' });
  }
  if (sharpness < 25) {
    issues.push({ code: 'blur', severity: sharpness < 12 ? 'high' : 'medium' });
  }
  if (noise > 45) {
    issues.push({ code: 'noise', severity: noise > 70 ? 'high' : 'medium' });
  }
  if (Math.abs(skewDegrees) > 0.6) {
    issues.push({ code: 'skew', severity: Math.abs(skewDegrees) > 4 ? 'high' : 'low' });
  }
  if (backgroundVariation > 30) {
    issues.push({
      code: 'uneven-lighting',
      severity: backgroundVariation > 55 ? 'high' : 'medium',
    });
  }
  if (faint > 190 && darkRatio > 0.001) {
    issues.push({ code: 'faint-text', severity: faint > 215 ? 'high' : 'low' });
  }

  let preset: RefinementPresetId = 'document';
  if (noise > 55 || backgroundVariation > 45) {
    preset = 'camera';
  }
  if (contrast < 32 || brightness < 35) {
    preset = 'low-contrast';
  }
  if (brightness >= 35 && contrast >= 32 && noise <= 55 && sharpness < 25) {
    preset = 'old-scan';
  }

  const recommendedParams: RefinementParams = {
    ...DEFAULT_REFINEMENT_PARAMS,
    ...getPresetParams(preset),
  };
  if (Math.abs(skewDegrees) > 0.4) {
    recommendedParams.deskew = true;
  }
  if (brightness < 45) {
    recommendedParams.brightness = clamp(recommendedParams.brightness + 12, -100, 100);
  } else if (brightness > 85) {
    recommendedParams.brightness = clamp(recommendedParams.brightness - 10, -100, 100);
  }
  if (contrast < 45) {
    recommendedParams.contrast = clamp(
      recommendedParams.contrast + Math.round((45 - contrast) / 2),
      0,
      100,
    );
  }
  if (noise > 35) {
    recommendedParams.denoise = clamp(
      Math.max(recommendedParams.denoise, Math.round(noise * 0.8)),
      0,
      100,
    );
  }
  if (sharpness < 30) {
    recommendedParams.sharpen = clamp(Math.max(recommendedParams.sharpen, 30), 0, 100);
  } else if (sharpness > 75) {
    recommendedParams.sharpen = Math.min(recommendedParams.sharpen, 15);
  }
  if (backgroundVariation > 28) {
    recommendedParams.shadowRemoval = true;
  }

  return {
    width: buffer.width,
    height: buffer.height,
    brightness: Math.round(brightness),
    contrast: Math.round(contrast),
    sharpness: Math.round(sharpness),
    noise: Math.round(noise),
    skewDegrees,
    darkRatio,
    backgroundVariation: Math.round(backgroundVariation),
    issues,
    recommendedPreset: preset,
    recommendedParams,
  };
}
