import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(root, 'node_modules');
const targetRoot = join(root, 'public', 'ocr');

const tesseractDir = join(sourceRoot, 'tesseract.js');
const coreDir = join(sourceRoot, 'tesseract.js-core');
const workerDir = join(tesseractDir, 'dist');

if (!existsSync(tesseractDir) || !existsSync(coreDir)) {
  console.error('Tesseract.js is not installed. Run npm install first.');
  process.exit(1);
}

const files = [
  { from: join(workerDir, 'worker.min.js'), to: 'worker.min.js' },
  { from: join(tesseractDir, 'LICENSE.md'), to: 'LICENSE.tesseract-js.md' },
  { from: join(coreDir, 'LICENSE'), to: 'LICENSE.tesseract-core.txt' },
];

for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
  const baseName = `tesseract-core-${variant}`;
  files.push(
    { from: join(coreDir, `${baseName}.wasm.js`), to: `${baseName}.wasm.js` },
    { from: join(coreDir, `${baseName}.wasm`), to: `${baseName}.wasm` },
  );
}

await mkdir(targetRoot, { recursive: true });
for (const file of files) {
  if (!existsSync(file.from)) {
    console.error(`Missing OCR runtime asset: ${file.from}`);
    process.exit(1);
  }
  await copyFile(file.from, join(targetRoot, file.to));
}

console.log(`OCR runtime assets ready in ${targetRoot}`);
