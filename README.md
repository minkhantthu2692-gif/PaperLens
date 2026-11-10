# PaperLens

PaperLens is a local-first, privacy-conscious web app/PWA that turns PDFs, scans, and OCR
output into clean, editable documents. Documents are processed and stored on your device by
default. AI assistance is optional, bring-your-own-key, and never required for the core
workflow.

> Status: **Phase 2 — OCR and reconstruction foundation**. The app imports PDF, image, and text
> files into IndexedDB, runs local OCR with bundled English/Burmese models, supports source
> viewing, rich-text editing, TXT/HTML/PDF (print) export, and backup/restore. Representative
> scan-quality testing, extra language packs, AI assistance, DOCX export, and the installable
> PWA/service worker remain future work.

## Product rules

- Local-first storage and processing; no mandatory backend or account.
- AI is optional, BYOK, and has no in-app credits or bundled model.
- Non-destructive editing with reviewable transformations.
- Portable static build for GitHub Pages, Vercel, and Cloudflare Pages.
- English is the default language; Burmese is supported from the start.

See [`AGENTS.md`](./AGENTS.md) for engineering rules and [`Prompt.md`](./Prompt.md) for the
product specification.

## Tech stack

| Concern       | Choice                                              |
| ------------- | --------------------------------------------------- |
| UI            | React 18 + TypeScript (strict)                      |
| Build         | Vite 5 (Node 18.18+ compatible)                     |
| Styling       | CSS Modules + CSS custom properties (design tokens) |
| i18n          | i18next + react-i18next (English, Burmese)          |
| Persistence   | IndexedDB via `idb` (schema-versioned)              |
| Editor        | Tiptap (rich text, local autosave)                  |
| Source viewer | PDF.js (canvas, text layer, regions)                |
| OCR           | Tesseract.js 7, worker-based, bundled EN/MY models  |
| Tests         | Vitest + Testing Library + jsdom                    |

## Current capabilities

- Import PDF, PNG, JPEG, WebP, and UTF-8 TXT files up to 25 MB; files are validated and kept
  as immutable local source assets.
- Library with rename/delete, local autosave, and a responsive two-panel workspace with a
  draggable splitter and mobile Source/Editor tabs.
- PDF viewing with page navigation, zoom, thumbnails, approximate text selection, page-text
  insertion, and drag-to-select region copy/download/OCR. Image zoom, region crop, and OCR.
- Local OCR for the current PDF page, all pages, the full image, or a selected region, with
  English, Burmese, or combined recognition, progress, cancellation, preview, and insert.
  Runtime assets and language models are bundled; no upload or account is required.
- Rich-text editing (headings, lists, quotes, alignment, links, undo/redo) with word/character
  counts and explicit save state.
- Export to plain text, standalone HTML, or PDF through the browser print dialog.
- Versioned JSON backup and restore, storage-usage display, and delete-all-local-data controls.
- English and Burmese UI, light/dark/system themes, offline status indicator.

Current limitations: PDF text selection is approximate. OCR accuracy varies with scan quality
and has not yet been validated against a representative English/Burmese corpus in this
environment. DOCX export, direct PDF file generation, AI assistance, extra OCR language packs, and installable
PWA behavior are not implemented yet. Browser storage can be cleared or evicted, so keep
backups.

## Getting started

Requirements: Node.js 18.18+ (Node 20 LTS or newer recommended) and npm.

```bash
npm install
npm run dev
```

## Scripts

| Script                 | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start the development server                 |
| `npm run build`        | Type-check and build the production bundle   |
| `npm run preview`      | Preview the production build                 |
| `npm run typecheck`    | Run TypeScript project checks                |
| `npm run lint`         | Run ESLint                                   |
| `npm run format`       | Format sources with Prettier                 |
| `npm run format:check` | Verify formatting without writing            |
| `npm run test`         | Run unit tests once                          |
| `npm run test:watch`   | Run unit tests in watch mode                 |
| `npm run verify`       | Lint, type-check, test, and build everything |

## Project structure

```text
src/
├── app/          # App-level providers (theme, i18n wiring, error boundary)
├── components/   # Reusable UI primitives and layout components
├── features/     # Feature modules (documents, workspace, editor, settings, assistant)
├── domain/       # Framework-independent document types and transformations
├── services/     # Storage, PDF, OCR, AI adapters, export
├── workers/      # Web Workers for CPU-heavy work
├── hooks/        # Shared React hooks
├── lib/          # Small framework-independent utilities
├── i18n/         # Localization setup and locale resources
├── styles/       # Design tokens, themes, base styles
└── test/         # Test setup and shared fixtures
```

## Development notes for Android / Termux workspaces

Android shared storage mounts can reject symlinks and executable bits. That breaks npm's
`.bin` links and native binaries such as esbuild. For this workspace, back `node_modules`
with an exec-capable temporary filesystem:

```bash
mkdir -p /tmp/paperlens-node_modules node_modules
mount --bind /tmp/paperlens-node_modules node_modules
npm install --ignore-scripts
```

OCR runtime files are copied from `node_modules` into `public/ocr/` by
`scripts/sync-ocr-assets.mjs`, which runs automatically before `dev`, `build`, and `preview`.
Bundled language models live in `public/ocr/lang/` with source and checksums documented in
its README. Generated runtime files are not committed.

The bind mount must be recreated after a reboot; the dependency tree is disposable and is
never committed. Package scripts call Node entry points directly (`node ./node_modules/...`)
so they do not depend on executable `.bin` shims. `--ignore-scripts` is used here because the
esbuild postinstall cannot spawn from this storage; verify the bundled esbuild binary after
installing. On a normal desktop filesystem, plain `npm install` and the same scripts work.

## Deployment

The app is a static SPA with no required server functions. The build output is `dist/`.
`VITE_BASE_PATH` controls the public base path (default `/`), required for sub-path
deployments such as GitHub Pages (`/PaperLens/`). Because routing is client-side, configure an
SPA fallback to `index.html`: on Vercel add a rewrite, on Cloudflare Pages enable single-page
app handling, and on GitHub Pages publish a `404.html` copy of `index.html`. Service-worker
and PWA install support are added in a later phase.

## Privacy and security

- Never commit API keys, credentials, or user documents. `.gitignore` covers environment
  files, keys, archives, and local document stores.
- Browser storage can be cleared by the browser or user; users should keep backups. Backup
  files contain document text and source files, so store them somewhere safe.
- OCR runs in a browser worker with bundled language models; source pages are not uploaded.
- No telemetry or analytics are included.

## License

License decision is pending product-owner confirmation. Until then, treat the repository as
all rights reserved.
