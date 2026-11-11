import { createBuffer, resizeBuffer, type ImageBuffer } from './filters';

export type EncodedImageFormat = 'image/png' | 'image/jpeg';

export class ImageCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageCodecError';
  }
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall back to an <img> element below.
    }
  }
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new ImageCodecError('Image decoding is not supported in this browser');
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageCodecError('The image could not be decoded'));
    };
    image.src = url;
  });
}

function drawToCanvas(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ImageCodecError('A 2D canvas context is unavailable');
  }
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

export async function decodeImageBlob(blob: Blob): Promise<ImageBuffer> {
  const source = await loadBitmap(blob);
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!width || !height) {
    throw new ImageCodecError('The image has no usable dimensions');
  }
  const canvas = drawToCanvas(source, width, height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ImageCodecError('A 2D canvas context is unavailable');
  }
  const imageData = context.getImageData(0, 0, width, height);
  const buffer = createBuffer(width, height);
  buffer.data.set(imageData.data);
  if (source instanceof ImageBitmap) {
    source.close();
  }
  return buffer;
}

export async function encodeImageBuffer(
  buffer: ImageBuffer,
  format: EncodedImageFormat = 'image/png',
  quality = 0.95,
): Promise<Blob> {
  const canvas = drawToCanvasFromBuffer(buffer);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new ImageCodecError('The refined image could not be encoded'));
        }
      },
      format,
      quality,
    );
  });
}

function drawToCanvasFromBuffer(buffer: ImageBuffer): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ImageCodecError('A 2D canvas context is unavailable');
  }
  context.putImageData(
    new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height),
    0,
    0,
  );
  return canvas;
}

/** Downsizes an image and returns a data URL suitable for a provider request. */
export async function createDownscaledDataUrl(
  blob: Blob,
  maxDimension: number,
  format: EncodedImageFormat = 'image/jpeg',
  quality = 0.85,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const decoded = await decodeImageBlob(blob);
  const { buffer } = resizeBuffer(decoded, maxDimension);
  const encoded = await encodeImageBuffer(buffer, format, quality);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ImageCodecError('The image could not be read'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new ImageCodecError('The image could not be read'));
      }
    };
    reader.readAsDataURL(encoded);
  });
  return { dataUrl, width: buffer.width, height: buffer.height };
}
