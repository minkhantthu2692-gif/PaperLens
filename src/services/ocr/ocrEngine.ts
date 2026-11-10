export type OcrLanguageId = 'eng' | 'mya' | 'eng+mya';

export const OCR_LANGUAGES = ['eng', 'mya', 'eng+mya'] as const;

export function isOcrLanguage(value: string | null | undefined): value is OcrLanguageId {
  return !!value && (OCR_LANGUAGES as readonly string[]).includes(value);
}

export interface OcrAssetPaths {
  workerPath: string;
  corePath: string;
  langPath: string;
}

/** All OCR runtime files are bundled and served from the app's base path for offline use. */
export function getOcrAssetPaths(): OcrAssetPaths {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return {
    workerPath: `${base}ocr/worker.min.js`,
    corePath: `${base}ocr`,
    langPath: `${base}ocr/lang`,
  };
}

export interface OcrSession {
  recognize(image: Blob, onProgress: (progress: number) => void): Promise<string>;
  terminate(): Promise<void>;
}

interface TesseractWorkerLike {
  recognize(image: Blob): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

export async function createOcrSession(languages: OcrLanguageId): Promise<OcrSession> {
  const { createWorker, OEM } = await import('tesseract.js');
  let progressHandler: ((progress: number) => void) | null = null;
  const worker = (await createWorker(languages, OEM.LSTM_ONLY, {
    ...getOcrAssetPaths(),
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (message: { status: string; progress: number }) => {
      if (message.status === 'recognizing text') {
        progressHandler?.(message.progress);
      }
    },
  })) as unknown as TesseractWorkerLike;

  return {
    async recognize(image, onProgress) {
      progressHandler = onProgress;
      try {
        const { data } = await worker.recognize(image);
        return data.text;
      } finally {
        progressHandler = null;
      }
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
