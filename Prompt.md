# Prompt.md — PaperLens Product & Build Specification

GitHub Repository Url : https://github.com/minkhantthu2692-gif/PaperLens.git

## 1. Project goal

Build **PaperLens**, a polished, reliable, local-first Web App/PWA that helps users turn PDFs, scanned pages, and OCR output into clean, editable documents.

The app should make document reconstruction approachable for beginners while remaining technically sound and useful for demanding documents. It should combine OCR, document structure reconstruction, a rich-text editor, export, and optional AI assistance.

This is a web app/PWA only. A native desktop application is not part of the scope.

## 2. Product principles

1. **Local-first and privacy-conscious:** document processing and storage happen on the user's device by default.
2. **AI is optional:** the app must remain useful without AI, an API key, or an internet connection.
3. **BYOK:** users provide their own AI provider API key. The user is responsible for provider charges.
4. **No local AI model:** do not bundle or download a small AI model, local inference engine, or model runtime.
5. **No app credits:** do not implement an in-app AI credit currency or imply the app pays for provider usage.
6. **Transparent usage:** show clear controls and estimates, and do not promise that an API provider's free tier is guaranteed.
7. **Non-destructive editing:** preserve the source and make transformations reviewable and reversible.
8. **Portable deployment:** remain compatible with Cloudflare Pages, Vercel, and GitHub Pages.
9. **Quality over feature count:** avoid scope creep; deliver complete, tested features instead of superficial placeholders.

## 3. Target users and core workflow

A user should be able to:

1. Open the app and import a supported PDF, image, or OCR text.
2. Preview source pages and run OCR with the chosen language(s).
3. Reconstruct and clean text layout, reading order, paragraphs, and supported structure.
4. Edit the result in a rich-text editor.
5. Use deterministic offline cleanup tools or optionally request AI assistance.
6. Review and accept/reject transformations.
7. Export or download the result in supported formats.
8. Save work locally and back it up/restores it later.

The main workflow must not require registration or a mandatory backend unless the product owner explicitly approves one.

## 4. Feature requirements

### 4.1 Import and document workspace

- Provide a clear, responsive workspace for source document preview and reconstructed content.
- Support relevant input types such as PDF, image scans, and plain OCR text; exact format coverage must be documented and verified.
- Validate file type and size, provide useful errors, and handle corrupt or unsupported files gracefully.
- Show processing state and progress for long tasks.
- Preserve the original source separately from derived text/results.
- Support document naming, local save, reopen, delete, backup, and restore.
- Provide an empty state that guides the user to import their first document.

### 4.2 OCR and language selection

- Bundle English and Burmese OCR language data by default, where practical and licensing permits.
- Make other supported OCR languages discoverable in Settings as optional language packs.
- When a selected language pack is missing, offer one-click download/install and resume the OCR task after installation.
- Display package size, download progress, install status, and actionable errors.
- Verify package origin/version/integrity where available. Do not execute downloaded arbitrary code.
- Support multilingual OCR selection when the OCR engine allows it.
- Make the OCR engine an implementation decision based on realistic quality, browser support, performance, memory, license, and bundle-size tests—not an unexamined assumption.
- Explain limitations, especially for complex layouts, handwriting, low-resolution scans, tables, and mixed languages.

### 4.3 Document reconstruction and editing

- Reconstruct reading order, paragraphs, line breaks, and basic document structure as accurately as feasible.
- Provide a rich-text editor for manual editing without AI.
- Support common editing needs such as headings, paragraphs, lists, undo/redo, and selection; additional structures such as tables/page breaks should be included when practical and supported.
- Preserve original text and allow reversible transformations.
- Use worker/WASM-based processing where appropriate to avoid freezing the interface.
- Handle large documents with progress feedback and cancellation where feasible.
- Do not claim perfect layout recovery; communicate the practical limitations of OCR and reconstruction.

### 4.4 AI assistance — optional, BYOK

AI features may include:

- selected-text contextual AI actions in a floating popup/toolbar;
- translation popup with target-language selection, translate action, result preview, and accept/copy/replace options;
- OCR text cleanup and paragraph reflow;
- rewriting, proofreading, summarization, or other focused tools only when their scope and safeguards are clearly defined.

Requirements:

- User configures provider, model, and API key.
- Users may select free-tier or paid-tier provider offerings. Do not hard-restrict providers to free tiers.
- Clearly warn that provider charges may apply and that the user is responsible for billing.
- No AI call without a configured key and an explicit user action.
- Explain what selected text/document content will be sent to the external provider before first use and make the scope visible.
- Keep AI input bounded. Prefer selected text or paragraph-sized chunks instead of sending an entire document.
- Include configurable input character/token cap, maximum output tokens, request timeout, bounded retry count, and maximum concurrent requests.
- Show estimated usage/cost when possible, with a clear “estimate” label and assumptions. Show a warning threshold and daily/monthly budget controls where feasible.
- Respect user-set limits and pause/ask for confirmation when a threshold is reached.
- Do not silently fall back to a paid model/provider. Paid fallback is explicit and disabled by default.
- Display provider quota/usage only when the provider exposes it. Otherwise clearly state that the app cannot inspect provider-side quota or billing.
- Do not guarantee free usage, exact cost, or unlimited use.
- Never log API keys, document content, prompts, or authorization headers.
- Prefer direct browser-to-provider calls only if provider browser access/CORS and security are supported. Do not add a proxy without approval.
- Provide cancellation and clear errors for authentication, quota, rate limit, network, and provider failures.
- AI must not silently overwrite the source. Present output for review, then allow the user to accept, reject, copy, or replace intentionally.

### 4.5 Offline Smart Assistance — no local AI

The app should offer useful offline assistance through deterministic local functions, not AI inference.

Potential built-in functions:

- whitespace cleanup and repeated blank-line normalization;
- OCR line reflow and paragraph reconstruction;
- conservative line-end hyphenation repair;
- duplicate-line detection;
- Unicode/punctuation normalization;
- basic heading and paragraph heuristics.

These functions must be transparent, predictable, previewable, and reversible. Avoid aggressive automatic changes that could alter meaning.

### 4.6 Optional AI Result Cache

An optional cache may reuse a previously completed AI result for an exact matching request.

- Cache key should account for normalized input, task/action, language, provider/model identity, and relevant prompt/version settings.
- Only return cached results for a matching request. Do not infer or generate a new answer offline.
- Make caching configurable, bounded, expiring, and clearable.
- Keep it separate from user document storage.
- Disclose what is cached and avoid caching sensitive content by default.
- On an offline cache miss, explain that a new AI request requires internet access.

### 4.7 Export, backup, and restore

- Provide export to appropriate editable and/or portable formats based on implementation and validated support (for example, TXT, DOCX, or PDF).
- Do not advertise an export format until it works reliably.
- Provide local backup and restore for documents and relevant metadata.
- Include validation, progress, and useful error states for export/import.
- Ensure restored files are versioned/migrated safely.
- Warn users that browser storage may be cleared or evicted; backup is important.

### 4.8 Settings and controls

Provide a well-organized Settings area, including as applicable:

- appearance/theme;
- OCR language packs and installation status;
- AI provider/model and API key configuration;
- AI usage guardrails, estimates, warning thresholds, daily/monthly limits, concurrency, retries, and paid fallback;
- cache settings and clear-cache action;
- local data management, backup, restore, and deletion;
- app version, supported formats, privacy information, and limitations.
- Implement a provider adapter architecture supporting:
1. OpenAI
2. Google Gemini
3. Anthropic
4. OpenRouter
5. Groq
6. DeepSeek
7. Mistral
8. xAI
9. Together AI
10. Custom OpenAI-Compatible Endpoints

Do not assume every provider offers a free tier, identical API compatibility, model discovery, or the same capabilities.
Verify provider capabilities through official documentation and actual integration tests.
Avoid hardcoded model lists. Implement dynamic model discovery when supported, with manual model entry as a fallback.
- Support Multiple API Key for Same Provider 

- Do not crowd the interface with advanced options by default. Use clear sections and beginner-friendly descriptions.

## 5. Offline and PWA requirements

When installed or used offline, the app should support as much of the core workflow as browser capabilities allow:

- app shell and essential assets;
- opening locally stored documents;
- local OCR and document processing, when required assets/language packs are available;
- editing and local persistence;
- deterministic offline cleanup tools;
- export and backup where browser APIs permit;
- exact-match AI cache reuse, if enabled and a matching result exists.

A new AI request requires internet access. Clearly communicate offline state and unavailable operations.

PWA requirements:

- appropriate manifest and service worker;
- reliable update handling that does not unexpectedly discard unsaved work;
- cache only appropriate static/app resources, not sensitive document content by default;
- configurable base path and correct service-worker/asset paths;
- graceful behavior when installability or a browser API is unsupported;
- avoid caching API keys or private data in shared service-worker caches.

## 6. Hosting and portability

The build must be deployable to:

- Cloudflare Pages;
- Vercel;
- GitHub Pages.

Keep the application host-independent. Include deployment notes for each platform, including:

- build command and output directory;
- base path configuration;
- SPA routing/fallback behavior;
- PWA/service-worker path considerations;
- any platform-specific caveats.

Do not require platform-specific server functions for core functionality. If a provider-specific feature is proposed, explain the trade-off and ask for approval.

## 7. UX and visual design

Create a modern, professional, calm, document-focused interface. The app should feel trustworthy and efficient, not cluttered.

- Responsive mobile, tablet, and desktop layouts.
- Light and dark themes.
- Consistent typography, spacing, iconography, and component behavior.
- Use motion sparingly and respect reduced-motion preferences.
- Clear empty/loading/progress/success/error/offline states.
- Keyboard accessibility, semantic controls, visible focus, accessible labels, and adequate contrast.
- Helpful onboarding and beginner-friendly language.
- Clear destructive-action confirmations.
- Show processing progress and allow cancellation where feasible.
- Avoid glass/blur effects or heavy visual effects if they harm clarity, performance, or maintainability.
- Do not use placeholder buttons or fake interactions in the finished product.

## 8. Privacy and security

- Local-first by default; no registration or remote storage is required for the core app.
- Clearly disclose external AI data transfer and provider responsibility.
- Treat imported documents, OCR text, AI output, and package metadata as untrusted.
- Sanitize rich text and prevent XSS.
- Use a suitable Content Security Policy.
- Keep API keys out of logs, URLs, source control, and analytics.
- Do not add unnecessary third-party scripts, telemetry, or permissions.
- Audit dependency licenses and security/maintenance status.
- Make local data deletion and AI cache deletion independently available.
- Do not imply browser-side key storage is perfectly secure.

## 9. Performance and reliability

- Optimize for responsive interaction and reasonable memory use on mobile devices.
- Lazy-load optional OCR language packs and heavy modules.
- Keep heavy parsing/OCR/reconstruction off the main thread where possible.
- Use bounded queues, cancellation, and backpressure for processing and AI requests.
- Avoid loading every optional package at startup.
- Avoid large unnecessary dependencies.
- Handle browser storage quota errors, offline failures, unsupported APIs, and malformed files gracefully.
- Maintain data integrity through versioned persistence and safe migration.
- Avoid silent data loss; protect unsaved changes during navigation and PWA updates.

## 10. Suggested technical direction (evaluate before committing)

If the repository has no established stack, consider:

- React + TypeScript + Vite;
- a maintained rich-text editor such as Tiptap;
- IndexedDB and/or OPFS for local documents;
- service worker/PWA support;
- Web Workers and WASM for OCR and heavy processing;
- a provider adapter interface for AI integrations;
- modular, optional OCR language packs.

These are candidate choices, not unconditional requirements. Inspect the repository and benchmark alternatives before adding dependencies. Do not add a Python server or mandatory backend for a browser-first MVP without approval.

## 11. Delivery phases

Implement in small increments and keep each phase usable.

### Phase 0 — Discovery and architecture
- Inspect the repository and existing plan.
- Identify supported file formats, browser requirements, OCR candidate, editor, storage, and deployment approach.
- Record risks and ask about unresolved product decisions before major implementation.

### Phase 1 — Functional local-first foundation
- App shell, responsive workspace, theme, import, local persistence, document list/workspace, basic editing, backup/restore, and working export for selected formats.
- No required AI integration.

### Phase 2 — OCR and reconstruction
- OCR for bundled English/Burmese data.
- Reconstruction pipeline, progress, error handling, and offline operation with available assets.
- Test quality using representative files.

### Phase 3 — Optional language packs and deterministic offline tools
- Discover/install/manage additional language packs.
- Add predictable cleanup/reflow tools with preview and undo/revert.

### Phase 4 — BYOK AI and guardrails
- Provider/model/key settings.
- Selected-text AI actions, translation, and focused cleanup.
- Usage controls, estimates, warnings, bounded retries, cancellation, and explicit paid fallback behavior.

### Phase 5 — Optional exact-match cache and polish
- Configurable AI result cache.
- Accessibility, responsive polish, PWA update behavior, security review, performance testing, and deployment documentation.

Phases may be adjusted based on the existing repository, but do not skip foundational reliability and privacy work in favor of cosmetic features.

## 12. Acceptance criteria

The product is not considered complete until the following are verified:

- A user can import a supported file, run OCR when applicable, edit the result manually, save locally, and export a working output.
- Core editing and document operations do not require an AI key.
- English and Burmese OCR data are available by default within practical bundle constraints.
- Missing optional language packs can be installed through a clear guided flow.
- Offline mode works for supported local workflows and clearly distinguishes a cache hit from a new AI request.
- No local AI model or inference engine is bundled or downloaded.
- AI requests are explicit, bounded, and transparent about provider transfer and possible charges.
- No silent paid fallback or silent source-document overwrite occurs.
- User-configured limits are respected as far as app-observable usage permits, and uncertainty is disclosed.
- API keys and private document text are not logged.
- Backup/restore and data deletion work.
- The app builds and deploys to Cloudflare Pages, Vercel, and GitHub Pages with documented configuration.
- Responsive, accessibility, offline, and error-state checks are performed.
- No placeholder controls remain in the delivered feature set.

## 13. Questions to resolve with the product owner

Do not silently assume answers for decisions that materially affect scope:

- Exact supported input/output formats and whether complex tables/page layout are MVP requirements.
- OCR engine selection and acceptable quality/performance targets.
- Initial AI providers/models to support.
- Whether API key persistence is offered, and if so, the precise opt-in behavior.
- Whether any remote backend, telemetry, or account system is ever desired.
- Which export formats are essential for the first release.
- Final product name, branding, and UI language(s).


## 14. Confirmed reference workspace layout and Assistant UX

The product owner has clarified the workspace design. Treat these requirements as confirmed:

### 14.1 Workspace composition

- Keep the main workspace focused on **two primary panels only: Source and Editor**.
- On desktop, initialize Source and Editor at equal widths (approximately a 50/50 split).
- Include a visible, accessible draggable divider so the user can resize either panel. Enforce reasonable minimum panel sizes and prevent accidental collapse; if a panel-collapse feature is later added, it must be deliberate and must not replace resizing.
- The left sidebar must be collapsible. Prefer a compact icon-only sidebar by default while working in the document. It must be possible to expand it to reveal labels.
- Do not keep an always-open, wide navigation sidebar or permanently visible extra workspace panels.
- Keep the top bar and panel toolbars compact and focused on document tasks.
- On small screens, use an intentional responsive adaptation (for example, switch between Source and Editor tabs or stack the panels). Do not squeeze both panels into unusable widths.

### 14.2 Source panel is interactive

The Source panel must do more than display the original page as an image.

Include, as supported by the selected document format and OCR implementation:

- page navigation and page thumbnails;
- zoom, pan, and fit-to-view;
- selectable OCR text where a text layer exists;
- drag-to-select rectangular image regions for OCR/focused processing;
- clear visual selection boundaries and handles where practical;
- contextual actions for the selected text/region, such as OCR selection, copy, translate, or open AI Assistant;
- a way to insert or transfer recognized text into the Editor;
- useful progress, empty, unsupported, and error states.

Preserve the original source. Region OCR and AI actions should not silently overwrite existing editor content.

### 14.3 AI Assistant experience

- The everyday AI Assistant should look and behave like an assistant/chat interface, not a configuration dashboard.
- Do not show provider, model, API key, token limit, estimated cost, or budget configuration in the main Assistant panel/conversation by default.
- Put AI provider/model setup, key handling, usage limits, estimates, warning thresholds, and billing-related controls in Settings.
- Provide a clean entry point to open the Assistant from a selected source region/text or selected editor content.
- Show a concise contextual indication of the content being acted on (for example, selected text or page region) and disclose external provider transfer when applicable.
- Assistant responses should offer relevant actions such as Copy, Insert, Replace/Accept, or Retry. Require an intentional user action before changing editor content.
- Keep advanced configuration available in Settings without burdening ordinary Assistant use.

### 14.4 Reference mockup image

The product owner will include a reference mockup image in the project folder. Treat it as a visual design reference for the two-panel workspace, compact/collapsible sidebar, resizable divider, interactive source selection, and simple Assistant chat.

- Inspect the provided reference image when available.
- Use it to understand visual hierarchy and intent, not as a strict pixel-perfect or functionality specification.
- The written requirements in this file take precedence over incidental text, sample document content, and decorative details visible in the mockup.
- Do not assume the mockup's sample provider/model, document text, usage values, or status labels are real product defaults.
