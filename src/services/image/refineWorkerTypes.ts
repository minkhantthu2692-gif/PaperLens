import type { RefinementParams } from '@/domain/refinement';

export interface RefineWorkerRequest {
  id: number;
  blob: Blob;
  params: RefinementParams;
  /** Longest edge of the processing resolution (0 keeps the original size). */
  maxDimension: number;
  /** Hard pixel budget to avoid runaway memory use. */
  maxPixels: number;
  format: 'image/png' | 'image/jpeg';
  quality: number;
}

export type RefineWorkerResponse =
  | {
      id: number;
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      scale: number;
      deskewAngle: number;
    }
  | { id: number; ok: false; error: string };
