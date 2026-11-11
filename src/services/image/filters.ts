import type { PerspectiveQuad } from '@/domain/refinement';

/**
 * RGBA pixel buffer. It is independent of any canvas API so the filters can be
 * unit tested and executed inside a Web Worker.
 */
export interface ImageBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface Point {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createBuffer(width: number, height: number): ImageBuffer {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  return {
    width: safeWidth,
    height: safeHeight,
    data: new Uint8ClampedArray(safeWidth * safeHeight * 4),
  };
}

export function cloneBuffer(buffer: ImageBuffer): ImageBuffer {
  return {
    width: buffer.width,
    height: buffer.height,
    data: new Uint8ClampedArray(buffer.data),
  };
}

export function bufferLuminance(data: Uint8ClampedArray, index: number): number {
  return (
    0.299 * (data[index] ?? 0) + 0.587 * (data[index + 1] ?? 0) + 0.114 * (data[index + 2] ?? 0)
  );
}

/** Luminance plane (0…255) used by the analysis and threshold filters. */
export function luminanceArray(buffer: ImageBuffer): Float32Array {
  const { width, height, data } = buffer;
  const out = new Float32Array(width * height);
  for (let index = 0, pixel = 0; pixel < out.length; index += 4, pixel += 1) {
    out[pixel] = bufferLuminance(data, index);
  }
  return out;
}

export function resizeBuffer(
  buffer: ImageBuffer,
  maxDimension: number,
  maxPixels = 24_000_000,
): { buffer: ImageBuffer; scale: number } {
  const longest = Math.max(buffer.width, buffer.height);
  const pixels = buffer.width * buffer.height;
  const scale = Math.min(
    1,
    maxDimension > 0 ? maxDimension / longest : 1,
    maxPixels > 0 ? Math.sqrt(maxPixels / pixels) : 1,
  );
  if (!Number.isFinite(scale) || scale >= 0.999) {
    return { buffer, scale: 1 };
  }
  const width = Math.max(1, Math.round(buffer.width * scale));
  const height = Math.max(1, Math.round(buffer.height * scale));
  const out = createBuffer(width, height);
  const xRatio = buffer.width / width;
  const yRatio = buffer.height / height;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(buffer.height - 1, Math.floor((y + 0.5) * yRatio));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(buffer.width - 1, Math.floor((x + 0.5) * xRatio));
      const sourceIndex = (sourceY * buffer.width + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;
      out.data[targetIndex] = buffer.data[sourceIndex] ?? 0;
      out.data[targetIndex + 1] = buffer.data[sourceIndex + 1] ?? 0;
      out.data[targetIndex + 2] = buffer.data[sourceIndex + 2] ?? 0;
      out.data[targetIndex + 3] = buffer.data[sourceIndex + 3] ?? 255;
    }
  }
  return { buffer: out, scale };
}

export function grayscaleBuffer(buffer: ImageBuffer): ImageBuffer {
  const out = cloneBuffer(buffer);
  const { data } = out;
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(bufferLuminance(data, index));
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  return out;
}

export function autoLevelsBuffer(buffer: ImageBuffer): ImageBuffer {
  const histogram = new Uint32Array(256);
  const { data } = buffer;
  for (let index = 0; index < data.length; index += 4) {
    const bin = Math.round(bufferLuminance(data, index));
    histogram[bin] = (histogram[bin] ?? 0) + 1;
  }
  const total = data.length / 4;
  const clip = Math.max(1, Math.floor(total * 0.005));
  let low = 0;
  let high = 255;
  let accumulated = 0;
  for (let value = 0; value < 256; value += 1) {
    accumulated += histogram[value] ?? 0;
    if (accumulated >= clip) {
      low = value;
      break;
    }
  }
  accumulated = 0;
  for (let value = 255; value >= 0; value -= 1) {
    accumulated += histogram[value] ?? 0;
    if (accumulated >= clip) {
      high = value;
      break;
    }
  }
  if (high - low < 8) {
    return cloneBuffer(buffer);
  }
  const scale = 255 / (high - low);
  const out = cloneBuffer(buffer);
  const target = out.data;
  for (let index = 0; index < target.length; index += 4) {
    target[index] = clamp(((target[index] ?? 0) - low) * scale, 0, 255);
    target[index + 1] = clamp(((target[index + 1] ?? 0) - low) * scale, 0, 255);
    target[index + 2] = clamp(((target[index + 2] ?? 0) - low) * scale, 0, 255);
  }
  return out;
}

export function adjustBrightnessContrast(
  buffer: ImageBuffer,
  brightness: number,
  contrast: number,
): ImageBuffer {
  if (brightness === 0 && contrast === 0) {
    return cloneBuffer(buffer);
  }
  const offset = brightness * 1.2;
  const contrastValue = contrast * 2;
  const factor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const out = cloneBuffer(buffer);
  const { data } = out;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = clamp(((data[index] ?? 0) + offset - 128) * factor + 128, 0, 255);
    data[index + 1] = clamp(((data[index + 1] ?? 0) + offset - 128) * factor + 128, 0, 255);
    data[index + 2] = clamp(((data[index + 2] ?? 0) + offset - 128) * factor + 128, 0, 255);
  }
  return out;
}

export function denoiseBuffer(buffer: ImageBuffer, strength: number): ImageBuffer {
  const amount = clamp((strength / 100) * 0.9, 0, 0.9);
  if (amount <= 0) {
    return cloneBuffer(buffer);
  }
  const { width, height, data } = buffer;
  const out = cloneBuffer(buffer);
  const target = out.data;
  // A single reusable scratch buffer avoids per-pixel allocations, which keeps
  // full-resolution scans practical inside the worker.
  const values = new Uint8Array(9);
  for (let y = 0; y < height; y += 1) {
    const top = y > 0 ? y - 1 : y;
    const bottom = y < height - 1 ? y + 1 : y;
    const topOffset = top * width * 4;
    const middleOffset = y * width * 4;
    const bottomOffset = bottom * width * 4;
    for (let x = 0; x < width; x += 1) {
      const left = (x > 0 ? x - 1 : x) * 4;
      const center = x * 4;
      const right = (x < width - 1 ? x + 1 : x) * 4;
      const index = middleOffset + center;
      for (let channel = 0; channel < 3; channel += 1) {
        values[0] = data[topOffset + left + channel] ?? 0;
        values[1] = data[topOffset + center + channel] ?? 0;
        values[2] = data[topOffset + right + channel] ?? 0;
        values[3] = data[middleOffset + left + channel] ?? 0;
        values[4] = data[index + channel] ?? 0;
        values[5] = data[middleOffset + right + channel] ?? 0;
        values[6] = data[bottomOffset + left + channel] ?? 0;
        values[7] = data[bottomOffset + center + channel] ?? 0;
        values[8] = data[bottomOffset + right + channel] ?? 0;
        for (let position = 1; position < 9; position += 1) {
          const value = values[position] ?? 0;
          let cursor = position - 1;
          while (cursor >= 0 && (values[cursor] ?? 0) > value) {
            values[cursor + 1] = values[cursor] ?? 0;
            cursor -= 1;
          }
          values[cursor + 1] = value;
        }
        const median = values[4] ?? 0;
        target[index + channel] = (data[index + channel] ?? 0) * (1 - amount) + median * amount;
      }
    }
  }
  return out;
}

function blur3(buffer: ImageBuffer): Uint8ClampedArray {
  const { width, height, data } = buffer;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        let weight = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const sampleY = y + dy;
          if (sampleY < 0 || sampleY >= height) {
            continue;
          }
          const rowWeight = dy === 0 ? 2 : 1;
          for (let dx = -1; dx <= 1; dx += 1) {
            const sampleX = x + dx;
            if (sampleX < 0 || sampleX >= width) {
              continue;
            }
            const columnWeight = dx === 0 ? 2 : 1;
            const w = rowWeight * columnWeight;
            sum += (data[(sampleY * width + sampleX) * 4 + channel] ?? 0) * w;
            weight += w;
          }
        }
        out[index + channel] = weight > 0 ? sum / weight : (data[index + channel] ?? 0);
      }
      out[index + 3] = data[index + 3] ?? 255;
    }
  }
  return out;
}

export function sharpenBuffer(buffer: ImageBuffer, strength: number): ImageBuffer {
  const amount = clamp((strength / 100) * 1.5, 0, 1.5);
  if (amount <= 0) {
    return cloneBuffer(buffer);
  }
  const blurred = blur3(buffer);
  const out = cloneBuffer(buffer);
  const { data } = out;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const original = data[index + channel] ?? 0;
      const blurValue = blurred[index + channel] ?? 0;
      data[index + channel] = clamp(original + (original - blurValue) * amount, 0, 255);
    }
  }
  return out;
}

export function adaptiveThresholdBuffer(buffer: ImageBuffer, sensitivity = 50): ImageBuffer {
  const { width, height } = buffer;
  const gray = luminanceArray(buffer);

  let window = Math.round(Math.min(width, height) / 16);
  if (window % 2 === 0) {
    window += 1;
  }
  window = clamp(window, 9, 61);
  const radius = (window - 1) / 2;
  const offset = 12 - (clamp(sensitivity, 0, 100) / 100) * 22;

  // Sliding box mean with O(width) memory instead of a full integral image,
  // which keeps large scans inside a reasonable memory budget.
  const columnSums = new Float32Array(width);
  let top = 0;
  let bottom = Math.min(height - 1, radius);
  for (let y = 0; y <= bottom; y += 1) {
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) {
      columnSums[x] = (columnSums[x] ?? 0) + (gray[rowStart + x] ?? 0);
    }
  }

  const out = createBuffer(width, height);
  out.data.fill(255);
  for (let y = 0; y < height; y += 1) {
    const verticalCount = bottom - top + 1;
    let left = 0;
    let right = Math.min(width - 1, radius);
    let rowSum = 0;
    for (let x = 0; x <= right; x += 1) {
      rowSum += columnSums[x] ?? 0;
    }
    for (let x = 0; x < width; x += 1) {
      const horizontalCount = right - left + 1;
      const mean = rowSum / (horizontalCount * verticalCount);
      const value = (gray[y * width + x] ?? 0) < mean - offset ? 0 : 255;
      const index = (y * width + x) * 4;
      out.data[index] = value;
      out.data[index + 1] = value;
      out.data[index + 2] = value;

      const nextLeft = Math.max(0, x + 1 - radius);
      const nextRight = Math.min(width - 1, x + 1 + radius);
      while (left < nextLeft) {
        rowSum -= columnSums[left] ?? 0;
        left += 1;
      }
      while (right < nextRight) {
        right += 1;
        rowSum += columnSums[right] ?? 0;
      }
    }

    const nextBottom = Math.min(height - 1, y + 1 + radius);
    if (nextBottom > bottom) {
      const rowStart = nextBottom * width;
      for (let x = 0; x < width; x += 1) {
        columnSums[x] = (columnSums[x] ?? 0) + (gray[rowStart + x] ?? 0);
      }
      bottom = nextBottom;
    }
    const nextTop = Math.max(0, y + 1 - radius);
    if (nextTop > top) {
      const rowStart = top * width;
      for (let x = 0; x < width; x += 1) {
        columnSums[x] = (columnSums[x] ?? 0) - (gray[rowStart + x] ?? 0);
      }
      top = nextTop;
    }
  }
  return out;
}

export function removeShadowBuffer(buffer: ImageBuffer, strength: number): ImageBuffer {
  const amount = clamp(strength / 100, 0, 1);
  if (amount <= 0) {
    return cloneBuffer(buffer);
  }
  const { width, height, data } = buffer;
  const scale = Math.max(1, Math.round(Math.max(width, height) / 512));
  const smallWidth = Math.max(1, Math.floor(width / scale));
  const smallHeight = Math.max(1, Math.floor(height / scale));
  const small = new Float32Array(smallWidth * smallHeight);
  const counts = new Float32Array(smallWidth * smallHeight);

  for (let y = 0; y < height; y += 1) {
    const smallY = Math.min(smallHeight - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const smallX = Math.min(smallWidth - 1, Math.floor(x / scale));
      const target = smallY * smallWidth + smallX;
      small[target] = (small[target] ?? 0) + bufferLuminance(data, (y * width + x) * 4);
      counts[target] = (counts[target] ?? 0) + 1;
    }
  }
  for (let index = 0; index < small.length; index += 1) {
    const count = counts[index] ?? 1;
    small[index] = count > 0 ? (small[index] ?? 0) / count : 255;
  }

  // Large-radius box blur of the downscaled luminance approximates the
  // document background, including soft shadows and vignetting.
  const radius = Math.max(2, Math.round(Math.min(smallWidth, smallHeight) / 8));
  const stride = smallWidth + 1;
  const integral = new Float64Array(stride * (smallHeight + 1));
  for (let y = 0; y < smallHeight; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < smallWidth; x += 1) {
      rowSum += small[y * smallWidth + x] ?? 0;
      integral[(y + 1) * stride + (x + 1)] = (integral[y * stride + (x + 1)] ?? 0) + rowSum;
    }
  }
  const background = new Float32Array(smallWidth * smallHeight);
  for (let y = 0; y < smallHeight; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(smallHeight - 1, y + radius);
    for (let x = 0; x < smallWidth; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(smallWidth - 1, x + radius);
      const area = (right - left + 1) * (bottom - top + 1);
      const sum =
        (integral[(bottom + 1) * stride + (right + 1)] ?? 0) -
        (integral[top * stride + (right + 1)] ?? 0) -
        (integral[(bottom + 1) * stride + left] ?? 0) +
        (integral[top * stride + left] ?? 0);
      background[y * smallWidth + x] = sum / area;
    }
  }

  const sampleBackground = (x: number, y: number): number => {
    const smallX = clamp(x / scale, 0, smallWidth - 1);
    const smallY = clamp(y / scale, 0, smallHeight - 1);
    const x0 = Math.floor(smallX);
    const y0 = Math.floor(smallY);
    const x1 = Math.min(smallWidth - 1, x0 + 1);
    const y1 = Math.min(smallHeight - 1, y0 + 1);
    const fx = smallX - x0;
    const fy = smallY - y0;
    const topLeft = background[y0 * smallWidth + x0] ?? 255;
    const topRight = background[y0 * smallWidth + x1] ?? 255;
    const bottomLeft = background[y1 * smallWidth + x0] ?? 255;
    const bottomRight = background[y1 * smallWidth + x1] ?? 255;
    return (
      topLeft * (1 - fx) * (1 - fy) +
      topRight * fx * (1 - fy) +
      bottomLeft * (1 - fx) * fy +
      bottomRight * fx * fy
    );
  };

  const out = cloneBuffer(buffer);
  const target = out.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const backgroundValue = Math.max(1, sampleBackground(x, y));
      for (let channel = 0; channel < 3; channel += 1) {
        const original = target[index + channel] ?? 0;
        const corrected = clamp((original / backgroundValue) * 255, 0, 255);
        target[index + channel] = original * (1 - amount) + corrected * amount;
      }
    }
  }
  return out;
}

function sampleBilinear(
  buffer: ImageBuffer,
  x: number,
  y: number,
  target: Uint8ClampedArray,
  targetIndex: number,
): void {
  const { width, height, data } = buffer;
  if (x <= -1 || y <= -1 || x >= width || y >= height) {
    target[targetIndex] = 255;
    target[targetIndex + 1] = 255;
    target[targetIndex + 2] = 255;
    target[targetIndex + 3] = 255;
    return;
  }
  const clampedX = clamp(x, 0, width - 1);
  const clampedY = clamp(y, 0, height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  for (let channel = 0; channel < 4; channel += 1) {
    const topLeft = data[(y0 * width + x0) * 4 + channel] ?? 255;
    const topRight = data[(y0 * width + x1) * 4 + channel] ?? 255;
    const bottomLeft = data[(y1 * width + x0) * 4 + channel] ?? 255;
    const bottomRight = data[(y1 * width + x1) * 4 + channel] ?? 255;
    target[targetIndex + channel] =
      topLeft * (1 - fx) * (1 - fy) +
      topRight * fx * (1 - fy) +
      bottomLeft * (1 - fx) * fy +
      bottomRight * fx * fy;
  }
}

function rotateQuarter(buffer: ImageBuffer, quarter: 1 | 2 | 3): ImageBuffer {
  const { width, height, data } = buffer;
  if (quarter === 2) {
    const out = createBuffer(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = ((height - 1 - y) * width + (width - 1 - x)) * 4;
        const targetIndex = (y * width + x) * 4;
        out.data[targetIndex] = data[sourceIndex] ?? 0;
        out.data[targetIndex + 1] = data[sourceIndex + 1] ?? 0;
        out.data[targetIndex + 2] = data[sourceIndex + 2] ?? 0;
        out.data[targetIndex + 3] = data[sourceIndex + 3] ?? 255;
      }
    }
    return out;
  }
  const out = createBuffer(height, width);
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const sourceX = quarter === 1 ? y : width - 1 - y;
      const sourceY = quarter === 1 ? height - 1 - x : x;
      const sourceIndex = (sourceY * width + sourceX) * 4;
      const targetIndex = (y * out.width + x) * 4;
      out.data[targetIndex] = data[sourceIndex] ?? 0;
      out.data[targetIndex + 1] = data[sourceIndex + 1] ?? 0;
      out.data[targetIndex + 2] = data[sourceIndex + 2] ?? 0;
      out.data[targetIndex + 3] = data[sourceIndex + 3] ?? 255;
    }
  }
  return out;
}

export function rotateBuffer(buffer: ImageBuffer, degrees: number): ImageBuffer {
  const angle = ((degrees % 360) + 360) % 360;
  if (angle < 1e-4 || angle > 360 - 1e-4) {
    return cloneBuffer(buffer);
  }
  if (Math.abs(angle - 90) < 1e-4) {
    return rotateQuarter(buffer, 1);
  }
  if (Math.abs(angle - 180) < 1e-4) {
    return rotateQuarter(buffer, 2);
  }
  if (Math.abs(angle - 270) < 1e-4) {
    return rotateQuarter(buffer, 3);
  }

  const { width, height } = buffer;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const outWidth = Math.max(1, Math.round(Math.abs(width * cos) + Math.abs(height * sin)));
  const outHeight = Math.max(1, Math.round(Math.abs(width * sin) + Math.abs(height * cos)));
  const out = createBuffer(outWidth, outHeight);
  out.data.fill(255);
  const centerX = width / 2;
  const centerY = height / 2;
  const outCenterX = outWidth / 2;
  const outCenterY = outHeight / 2;
  for (let y = 0; y < outHeight; y += 1) {
    const dy = y + 0.5 - outCenterY;
    for (let x = 0; x < outWidth; x += 1) {
      const dx = x + 0.5 - outCenterX;
      const sourceX = cos * dx + sin * dy + centerX;
      const sourceY = -sin * dx + cos * dy + centerY;
      sampleBilinear(buffer, sourceX, sourceY, out.data, (y * outWidth + x) * 4);
    }
  }
  return out;
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function computeHomography(source: Point[], target: Point[]): number[] | null {
  const matrix: number[][] = [];
  const vector: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const sourcePoint = source[index] as Point;
    const targetPoint = target[index] as Point;
    matrix.push([
      sourcePoint.x,
      sourcePoint.y,
      1,
      0,
      0,
      0,
      -sourcePoint.x * targetPoint.x,
      -sourcePoint.y * targetPoint.x,
    ]);
    vector.push(targetPoint.x);
    matrix.push([
      0,
      0,
      0,
      sourcePoint.x,
      sourcePoint.y,
      1,
      -sourcePoint.x * targetPoint.y,
      -sourcePoint.y * targetPoint.y,
    ]);
    vector.push(targetPoint.y);
  }

  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(matrix[row]?.[column] ?? 0) > Math.abs(matrix[pivot]?.[column] ?? 0)) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot]?.[column] ?? 0) < 1e-10) {
      return null;
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot] as number[], matrix[column] as number[]];
    [vector[column], vector[pivot]] = [vector[pivot] as number, vector[column] as number];
    const row = matrix[column] as number[];
    const divisor = row[column] as number;
    for (let index = column; index < 8; index += 1) {
      row[index] = (row[index] as number) / divisor;
    }
    vector[column] = (vector[column] as number) / divisor;
    for (let other = 0; other < 8; other += 1) {
      if (other === column) {
        continue;
      }
      const factor = matrix[other]?.[column] ?? 0;
      if (factor === 0) {
        continue;
      }
      for (let index = column; index < 8; index += 1) {
        matrix[other]![index] = (matrix[other]?.[index] ?? 0) - factor * (row[index] as number);
      }
      vector[other] = (vector[other] as number) - factor * (vector[column] as number);
    }
  }
  return vector;
}

function applyHomography(matrix: number[], point: Point): Point {
  const denominator = (matrix[6] as number) * point.x + (matrix[7] as number) * point.y + 1;
  const safeDenominator = Math.abs(denominator) < 1e-10 ? 1e-10 : denominator;
  return {
    x:
      ((matrix[0] as number) * point.x + (matrix[1] as number) * point.y + (matrix[2] as number)) /
      safeDenominator,
    y:
      ((matrix[3] as number) * point.x + (matrix[4] as number) * point.y + (matrix[5] as number)) /
      safeDenominator,
  };
}

export function perspectiveBuffer(buffer: ImageBuffer, quad: PerspectiveQuad): ImageBuffer {
  const { width, height } = buffer;
  const topLeft = { x: quad.topLeft.x * width, y: quad.topLeft.y * height };
  const topRight = { x: quad.topRight.x * width, y: quad.topRight.y * height };
  const bottomRight = { x: quad.bottomRight.x * width, y: quad.bottomRight.y * height };
  const bottomLeft = { x: quad.bottomLeft.x * width, y: quad.bottomLeft.y * height };

  const outWidth = Math.max(
    8,
    Math.min(
      width,
      Math.round(Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight))),
    ),
  );
  const outHeight = Math.max(
    8,
    Math.min(
      height,
      Math.round(Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight))),
    ),
  );

  const rectangle: Point[] = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];
  const matrix = computeHomography(rectangle, [topLeft, topRight, bottomRight, bottomLeft]);
  if (!matrix) {
    return cloneBuffer(buffer);
  }

  const out = createBuffer(outWidth, outHeight);
  out.data.fill(255);
  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const source = applyHomography(matrix, { x: x + 0.5, y: y + 0.5 });
      sampleBilinear(buffer, source.x, source.y, out.data, (y * outWidth + x) * 4);
    }
  }
  return out;
}

/**
 * Conservative page dewarping: estimates the per-column vertical displacement of
 * dark (text) pixels, removes the smooth trend and shifts each column back by
 * the (smoothed, clamped) residual. It is intentionally restrained so that
 * handwriting and character detail are preserved.
 */
export function dewarpBuffer(buffer: ImageBuffer, maxShiftRatio = 0.03): ImageBuffer {
  const { width, height } = buffer;
  if (width < 32 || height < 32) {
    return cloneBuffer(buffer);
  }
  const gray = luminanceArray(buffer);
  const startY = Math.floor(height * 0.05);
  const endY = Math.ceil(height * 0.95);
  const centroids = new Float32Array(width).fill(Number.NaN);
  const weights = new Float32Array(width);
  let validColumns = 0;

  for (let x = 0; x < width; x += 1) {
    let weightedSum = 0;
    let weightSum = 0;
    for (let y = startY; y < endY; y += 1) {
      const darkness = 255 - (gray[y * width + x] ?? 255);
      if (darkness < 60) {
        continue;
      }
      weightedSum += y * darkness;
      weightSum += darkness;
    }
    if (weightSum > 0) {
      centroids[x] = weightedSum / weightSum;
      weights[x] = weightSum;
      validColumns += 1;
    }
  }

  if (validColumns < width * 0.2) {
    return cloneBuffer(buffer);
  }

  // Fill gaps from the nearest valid neighbour so the trend is continuous.
  let lastValid = -1;
  for (let x = 0; x < width; x += 1) {
    if (Number.isNaN(centroids[x])) {
      if (lastValid < 0) {
        continue;
      }
      centroids[x] = centroids[lastValid] as number;
    } else {
      lastValid = x;
    }
  }
  for (let x = width - 1; x >= 0; x -= 1) {
    const value = centroids[x] as number;
    if (Number.isNaN(value)) {
      centroids[x] = x + 1 < width ? (centroids[x + 1] as number) : height / 2;
    }
  }

  // Weighted least-squares linear trend.
  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWXX = 0;
  let sumWXY = 0;
  for (let x = 0; x < width; x += 1) {
    const weight = weights[x] ?? 0;
    const value = centroids[x] as number;
    sumW += weight;
    sumWX += weight * x;
    sumWY += weight * value;
    sumWXX += weight * x * x;
    sumWXY += weight * x * value;
  }
  const denominator = sumW * sumWXX - sumWX * sumWX;
  const slope = Math.abs(denominator) < 1e-6 ? 0 : (sumW * sumWXY - sumWX * sumWY) / denominator;
  const intercept = sumW === 0 ? 0 : (sumWY - slope * sumWX) / sumW;

  const residuals = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    residuals[x] = (centroids[x] as number) - (intercept + slope * x);
  }

  const window = Math.max(4, Math.round(width / 16));
  const smoothed = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    const from = Math.max(0, x - window);
    const to = Math.min(width - 1, x + window);
    for (let index = from; index <= to; index += 1) {
      sum += residuals[index] as number;
      count += 1;
    }
    smoothed[x] = count > 0 ? sum / count : 0;
  }

  const maxShift = Math.max(1, Math.round(height * maxShiftRatio));
  let meaningful = false;
  for (let x = 0; x < width; x += 1) {
    if (Math.abs(smoothed[x] as number) > 1) {
      meaningful = true;
      break;
    }
  }
  if (!meaningful) {
    return cloneBuffer(buffer);
  }

  const out = createBuffer(width, height);
  out.data.fill(255);
  for (let x = 0; x < width; x += 1) {
    const shift = clamp(smoothed[x] as number, -maxShift, maxShift);
    for (let y = 0; y < height; y += 1) {
      const sourceY = y + shift;
      const y0 = clamp(Math.floor(sourceY), 0, height - 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fy = clamp(sourceY - y0, 0, 1);
      const targetIndex = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = buffer.data[(y0 * width + x) * 4 + channel] ?? 255;
        const bottom = buffer.data[(y1 * width + x) * 4 + channel] ?? 255;
        out.data[targetIndex + channel] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}
