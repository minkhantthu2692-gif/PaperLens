import { keys, set, del } from 'idb-keyval';

export type LanguagePackErrorCode = 'network' | 'http' | 'integrity' | 'unsupported';

export class LanguagePackError extends Error {
  readonly code: LanguagePackErrorCode;

  constructor(code: LanguagePackErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'LanguagePackError';
    this.code = code;
  }
}

export interface LanguagePack {
  code: string;
  name: string;
  nativeName: string;
  size: number;
  sha256: string;
  url: string;
}

const PINNED_COMMIT = '87416418657359cb625c412a48b6e1d6d41c29bd';

function packUrl(code: string): string {
  return `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${PINNED_COMMIT}/${code}.traineddata`;
}

function definePack(
  code: string,
  name: string,
  nativeName: string,
  size: number,
  sha256: string,
): LanguagePack {
  return { code, name, nativeName, size, sha256, url: packUrl(code) };
}

/**
 * Curated optional LSTM models from the pinned `tessdata_fast` revision. Sizes and SHA-256
 * checksums refer to the uncompressed `.traineddata` file served from that revision.
 */
export const OPTIONAL_LANGUAGE_PACKS: readonly LanguagePack[] = [
  definePack(
    'spa',
    'Spanish',
    'Español',
    2294433,
    '6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464',
  ),
  definePack(
    'fra',
    'French',
    'Français',
    1130365,
    'ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca',
  ),
  definePack(
    'deu',
    'German',
    'Deutsch',
    1525436,
    '19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d',
  ),
  definePack(
    'ita',
    'Italian',
    'Italiano',
    2701314,
    'b8f89e1e785118dac4d51ae042c029a64edb5c3ee42ef73027a6d412748d8827',
  ),
  definePack(
    'por',
    'Portuguese',
    'Português',
    1982756,
    'c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb',
  ),
  definePack(
    'rus',
    'Russian',
    'Русский',
    3861738,
    'e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225',
  ),
  definePack(
    'ara',
    'Arabic',
    'العربية',
    1432056,
    'e3206d3dc87fd50c24a0fb9f01838615911d25168f4e64415244b67d2bb3e729',
  ),
  definePack(
    'hin',
    'Hindi',
    'हिन्दी',
    1122751,
    '4c73ffc59d497c186b19d1e90f5d721d678ea6b2e277b719bee4e2af12271825',
  ),
  definePack(
    'tha',
    'Thai',
    'ไทย',
    1072600,
    '294227cc2d1292b0acb28d61d4115c88252b96d466ca90b417cf4cf0c67bf07c',
  ),
  definePack(
    'vie',
    'Vietnamese',
    'Tiếng Việt',
    531275,
    '79df64caf7bcfb2a27df5042ecb6121e196eada34da774956995747636d5bfa1',
  ),
  definePack(
    'chi_sim',
    'Chinese (Simplified)',
    '简体中文',
    2469156,
    'a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730',
  ),
  definePack(
    'jpn',
    'Japanese',
    '日本語',
    2471260,
    '1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d',
  ),
  definePack(
    'kor',
    'Korean',
    '한국어',
    1677415,
    '6b85e11d9bbf07863b97b3523b1b112844c43e713df8b66418a081fd1060b3b2',
  ),
  definePack(
    'tur',
    'Turkish',
    'Türkçe',
    4550554,
    '7393381111e1152420fc4092cb44eef4237580d21b92bf30d7d221aad192c6b7',
  ),
];

export function getOptionalLanguagePack(code: string): LanguagePack | undefined {
  return OPTIONAL_LANGUAGE_PACKS.find((pack) => pack.code === code);
}

function cacheKey(code: string): string {
  // Keep in sync with tesseract.js: `${cachePath || '.'}/${lang}.traineddata`.
  return `./${code}.traineddata`;
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'AbortError')
  );
}

/** Reads cache keys written by tesseract.js (and by pack installation) in IndexedDB. */
export async function listInstalledLanguageCodes(): Promise<Set<string>> {
  const installed = new Set<string>();
  const suffix = '.traineddata';
  for (const key of await keys()) {
    if (typeof key === 'string' && key.startsWith('./') && key.endsWith(suffix)) {
      installed.add(key.slice(2, -suffix.length));
    }
  }
  return installed;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new LanguagePackError('unsupported');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readBody(
  response: Response,
  expectedSize: number,
  onProgress: ((progress: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    onProgress?.(1);
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException('Aborted', 'AbortError');
    }
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.byteLength;
    if (expectedSize > 0) {
      onProgress?.(Math.min(received / expectedSize, 0.99));
    }
  }

  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress?.(1);
  return combined.buffer;
}

/**
 * Downloads, verifies, and stores a language pack in the same IndexedDB cache that
 * tesseract.js reads. Nothing is stored unless the checksum matches exactly.
 */
export async function installLanguagePack(
  pack: LanguagePack,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(pack.url, {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new LanguagePackError('network');
  }

  if (!response.ok) {
    throw new LanguagePackError('http');
  }

  const declaredSize = Number(response.headers.get('content-length')) || pack.size;
  const data = await readBody(response, declaredSize, onProgress, signal);

  if (data.byteLength !== pack.size || (await sha256Hex(data)) !== pack.sha256) {
    throw new LanguagePackError('integrity');
  }

  await set(cacheKey(pack.code), new Uint8Array(data));
}

export async function removeLanguagePack(code: string): Promise<void> {
  await del(cacheKey(code));
}
