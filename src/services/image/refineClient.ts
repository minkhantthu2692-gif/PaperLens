import type { RefinementParams } from '@/domain/refinement';
import { decodeImageBlob, encodeImageBuffer } from './codec';
import { resizeBuffer } from './filters';
import { applyRefinement } from './pipeline';
import type { RefineWorkerResponse } from './refineWorkerTypes';

export type RefinedImageFormat = 'image/png' | 'image/jpeg';

export interface RefineImageOptions {
  /** Longest edge of the processed image. 0 keeps the original resolution. */
  maxDimension?: number;
  maxPixels?: number;
  format?: RefinedImageFormat;
  quality?: number;
  signal?: AbortSignal;
}

export interface RefinementResult {
  blob: Blob;
  width: number;
  height: number;
  /** Processing scale relative to the original image (1 = full resolution). */
  scale: number;
  deskewAngle: number;
}

export class RefinementCancelledError extends Error {
  constructor() {
    super('Image refinement was cancelled');
    this.name = 'AbortError';
  }
}

const WORKER_TIMEOUT_MS = 120_000;

let worker: Worker | null = null;
let nextRequestId = 1;

function supportsWorkerPipeline(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./refine.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

function disposeWorker(): void {
  worker?.terminate();
  worker = null;
}

export function cancelPendingRefinements(): void {
  disposeWorker();
}

async function refineOnMainThread(
  blob: Blob,
  params: RefinementParams,
  options: RefineImageOptions,
): Promise<RefinementResult> {
  const {
    maxDimension = 1600,
    maxPixels = 16_000_000,
    format = 'image/png',
    quality = 0.95,
  } = options;
  const decoded = await decodeImageBlob(blob);
  if (options.signal?.aborted) {
    throw new RefinementCancelledError();
  }
  const { buffer, scale } = resizeBuffer(decoded, maxDimension, maxPixels);
  const outcome = applyRefinement(buffer, params);
  if (options.signal?.aborted) {
    throw new RefinementCancelledError();
  }
  const encoded = await encodeImageBuffer(outcome.buffer, format, quality);
  return {
    blob: encoded,
    width: outcome.buffer.width,
    height: outcome.buffer.height,
    scale,
    deskewAngle: outcome.deskewAngle,
  };
}

/**
 * Runs the refinement pipeline locally. Uses a Web Worker when the browser
 * supports OffscreenCanvas, and falls back to the main thread otherwise.
 * The original blob is never modified.
 */
export async function refineImage(
  blob: Blob,
  params: RefinementParams,
  options: RefineImageOptions = {},
): Promise<RefinementResult> {
  if (options.signal?.aborted) {
    throw new RefinementCancelledError();
  }
  if (!supportsWorkerPipeline()) {
    return refineOnMainThread(blob, params, options);
  }

  const targetWorker = ensureWorker();
  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise<RefinementResult>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      targetWorker.removeEventListener('message', handleMessage);
      targetWorker.removeEventListener('error', handleError);
      options.signal?.removeEventListener('abort', handleAbort);
      globalThis.clearTimeout(timer);
    };
    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      action();
    };
    const handleMessage = (event: MessageEvent<RefineWorkerResponse>) => {
      const data = event.data;
      if (!data || data.id !== id) {
        return;
      }
      if (data.ok) {
        finish(() =>
          resolve({
            blob: data.blob,
            width: data.width,
            height: data.height,
            scale: data.scale,
            deskewAngle: data.deskewAngle,
          }),
        );
      } else {
        finish(() => reject(new Error(data.error)));
      }
    };
    const handleAbort = () => {
      finish(() => {
        disposeWorker();
        reject(new RefinementCancelledError());
      });
    };
    const handleError = () => {
      finish(() => {
        disposeWorker();
        reject(new Error('The image processor could not be started'));
      });
    };
    const timer = globalThis.setTimeout(() => {
      finish(() => {
        disposeWorker();
        reject(new Error('Image refinement timed out'));
      });
    }, WORKER_TIMEOUT_MS);

    targetWorker.addEventListener('message', handleMessage);
    targetWorker.addEventListener('error', handleError);
    options.signal?.addEventListener('abort', handleAbort, { once: true });
    targetWorker.postMessage({
      id,
      blob,
      params,
      maxDimension: options.maxDimension ?? 1600,
      maxPixels: options.maxPixels ?? 16_000_000,
      format: options.format ?? 'image/png',
      quality: options.quality ?? 0.95,
    });
  });
}
