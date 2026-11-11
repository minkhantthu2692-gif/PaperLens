import { applyRefinement } from './pipeline';
import { createBuffer, resizeBuffer } from './filters';
import type { RefineWorkerRequest, RefineWorkerResponse } from './refineWorkerTypes';

interface WorkerScope {
  onmessage: ((event: MessageEvent<RefineWorkerRequest>) => void) | null;
  postMessage(value: unknown): void;
}

const scope = self as unknown as WorkerScope;

async function decode(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Offscreen canvas is unavailable');
    }
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const buffer = createBuffer(bitmap.width, bitmap.height);
    buffer.data.set(imageData.data);
    return buffer;
  } finally {
    bitmap.close();
  }
}

async function encode(
  buffer: ReturnType<typeof createBuffer>,
  format: 'image/png' | 'image/jpeg',
  quality: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(buffer.width, buffer.height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Offscreen canvas is unavailable');
  }
  context.putImageData(
    new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height),
    0,
    0,
  );
  return canvas.convertToBlob({ type: format, quality });
}

scope.onmessage = async (event: MessageEvent<RefineWorkerRequest>) => {
  const request = event.data;
  const respond = (response: RefineWorkerResponse) => scope.postMessage(response);

  try {
    const decoded = await decode(request.blob);
    const { buffer, scale } = resizeBuffer(decoded, request.maxDimension, request.maxPixels);
    const outcome = applyRefinement(buffer, request.params);
    const blob = await encode(outcome.buffer, request.format, request.quality);
    respond({
      id: request.id,
      ok: true,
      blob,
      width: outcome.buffer.width,
      height: outcome.buffer.height,
      scale,
      deskewAngle: outcome.deskewAngle,
    });
  } catch (error) {
    respond({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Image refinement failed',
    });
  }
};
