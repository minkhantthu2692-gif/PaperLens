import { copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const indexPath = join(root, 'dist', 'index.html');
const fallbackPath = join(root, 'dist', '404.html');

if (!existsSync(indexPath)) {
  console.error('dist/index.html is missing. Run the Vite build first.');
  process.exit(1);
}

await copyFile(indexPath, fallbackPath);
console.log('GitHub Pages SPA fallback written to dist/404.html');
