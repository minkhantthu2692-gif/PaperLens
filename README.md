# PaperLens

PaperLens is a local-first, privacy-conscious web app/PWA that turns PDFs, scans, and OCR
output into clean, editable documents. Documents are processed and stored on your device by
default. AI assistance is optional, bring-your-own-key, and never required for the core
workflow.

> Status: **Phase 0 — foundation**. The repository currently contains project tooling, the
> design-token layer, theming, and internationalization scaffolding. Document import, OCR,
> editing, and export are implemented in later phases. Nothing is represented as complete
> until it is implemented and verified.

## Product rules

- Local-first storage and processing; no mandatory backend or account.
- AI is optional, BYOK, and has no in-app credits or bundled model.
- Non-destructive editing with reviewable transformations.
- Portable static build for GitHub Pages, Vercel, and Cloudflare Pages.
- English is the default language; Burmese is supported from the start.

See [`AGENTS.md`](./AGENTS.md) for engineering rules and [`Prompt.md`](./Prompt.md) for the
product specification.

## Tech stack

| Concern       | Choice                                                  |
| ------------- | ------------------------------------------------------- |
| UI            | React 18 + TypeScript (strict)                          |
| Build         | Vite 5 (Node 18.18+ compatible)                         |
| Styling       | CSS Modules + CSS custom properties (design tokens)     |
| i18n          | i18next + react-i18next (English, Burmese)              |
| Persistence   | IndexedDB via `idb` (schema-versioned, planned Phase 1) |
| Editor        | Tiptap (planned Phase 1)                                |
| Source viewer | PDF.js (planned Phase 1)                                |
| OCR           | Tesseract.js, worker-based (planned Phase 2)            |
| Tests         | Vitest + Testing Library + jsdom                        |

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

The bind mount must be recreated after a reboot; the dependency tree is disposable and is
never committed. Package scripts call Node entry points directly (`node ./node_modules/...`)
so they do not depend on executable `.bin` shims. `--ignore-scripts` is used here because the
esbuild postinstall cannot spawn from this storage; verify the bundled esbuild binary after
installing. On a normal desktop filesystem, plain `npm install` and the same scripts work.

## Deployment

The app is a static SPA with no required server functions. The build output is `dist/`.
`VITE_BASE_PATH` controls the public base path (default `/`), which is required for
sub-path deployments such as GitHub Pages (`/PaperLens/`). Host-specific instructions are
documented as the phases that add routing and the service worker land.

## Privacy and security

- Never commit API keys, credentials, or user documents. `.gitignore` covers environment
  files, keys, archives, and local document stores.
- Browser storage can be cleared by the browser or user; users are expected to keep backups
  once backup/restore ships.
- No telemetry or analytics are included.

## License

License decision is pending product-owner confirmation. Until then, treat the repository as
all rights reserved.
