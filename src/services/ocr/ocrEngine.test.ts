import { describe, expect, it } from 'vitest';
import { getOcrAssetPaths, isOcrLanguage } from './ocrEngine';

describe('isOcrLanguage', () => {
  it('accepts bundled language identifiers', () => {
    expect(isOcrLanguage('eng')).toBe(true);
    expect(isOcrLanguage('mya')).toBe(true);
    expect(isOcrLanguage('eng+mya')).toBe(true);
  });

  it('rejects unsupported or empty values', () => {
    expect(isOcrLanguage('fra')).toBe(false);
    expect(isOcrLanguage('')).toBe(false);
    expect(isOcrLanguage(null)).toBe(false);
  });
});

describe('getOcrAssetPaths', () => {
  it('serves worker, core, and language files from the OCR asset directory', () => {
    expect(getOcrAssetPaths()).toEqual({
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr',
      langPath: '/ocr/lang',
    });
  });
});
