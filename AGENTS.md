# AGENTS.md — PaperLens

> Repository-wide instructions for AI coding agents and contributors.
> This file defines how to work in the codebase. `Prompt.md` defines the product requirements.

GitHub Repository Url : https://github.com/minkhantthu2692-gif/PaperLens.git

## 1. Product context

PaperLens is a local-first, responsive Web App/PWA for reconstructing editable documents from PDFs, scans, and OCR output. It should help users obtain clean, editable text and document structure while preserving a dependable manual editing and export workflow.

Core principles:

- Local-first: user documents and processing should remain on the user's device by default.
- AI is optional and BYOK (Bring Your Own Key). The user supplies their provider API key.
- No in-app AI credits, no bundled local AI model, and no local AI engine.
- The app must remain useful without an API key or internet connection.
- Explain clearly when document content will be sent to an external AI provider.
- Prioritize reliability, privacy, accessibility, performance, maintainability, and beginner-friendly UX.
- Do not expand scope without discussing it with the product owner.

## 2. Follow the product specification

Before implementing a feature:

1. Read `Prompt.md` and this file.
2. Inspect the existing repository, architecture, dependencies, and current behavior.
3. Identify the smallest coherent change that fulfills the requirement.
4. Preserve existing working behavior unless the product owner explicitly approves a change.
5. If requirements conflict, stop and ask for clarification rather than silently choosing.
6. Do not claim a feature is complete unless it is implemented, tested where practical, and its limitations are documented.

`Prompt.md` is the product source of truth. This file is the engineering behavior source of truth.

## 3. Architecture and platform

- Build a responsive Web App/PWA; native desktop applications are out of scope.
- Keep the application portable across Cloudflare Pages, Vercel, and GitHub Pages.
- Prefer a platform-independent static build. Do not make a hosting provider a mandatory runtime dependency.
- Support configurable base paths and correct asset/service-worker paths. Account for GitHub Pages subpath deployment.
- Configure SPA fallback behavior for each target host and document any host-specific setup.
- Do not add a backend merely for convenience. Any backend or proxy must be proposed with its privacy, key-handling, cost, and hosting implications and approved first.
- A browser-only architecture is preferred for the core workflow.
- Use Web Workers and/or WASM for CPU-heavy tasks where appropriate; avoid blocking the UI thread.
- Keep UI, document domain logic, persistence, OCR, AI-provider adapters, and export concerns separated behind clear interfaces.
- Prefer reusable components and typed interfaces over duplicated logic.
- Do not introduce framework, state-management, editor, OCR, or storage dependencies without evaluating bundle size, maintenance, license, browser support, and performance impact.

### Suggested baseline (not an irrevocable mandate)

If the repository does not already use a suitable stack, a reasonable starting point is React + TypeScript + Vite, a PWA/service-worker solution, a rich-text editor such as Tiptap, IndexedDB/OPFS for local persistence, and worker-based processing. Choose the OCR implementation only after testing realistic English/Burmese documents and target browsers. Do not treat these suggestions as already-approved dependencies.

## 4. Local data and persistence

- Store user documents and derived artifacts locally by default.
- Use IndexedDB and/or OPFS where suitable; do not put large documents in localStorage.
- Design persistence with schema versioning and safe migrations.
- Provide user-facing backup/export and restore/import. Browser storage can be cleared or evicted; do not imply local storage is permanent.
- Make deletion behavior clear and allow users to remove documents, derived outputs, and AI cache independently where applicable.
- Avoid collecting analytics or telemetry that exposes document text, API keys, or other private data. Do not add telemetry without approval and a clear disclosure.
- Do not log document content, prompts containing user content, API keys, authorization headers, or sensitive provider responses.

## 5. AI integration and usage controls

AI is optional and uses user-provided provider credentials.

- Do not build a local AI engine or download/bundle a small AI model.
- Do not add in-app AI credits or claim that the app guarantees free provider usage.
- Allow a user to configure supported providers/models, including free-tier and paid-tier offerings. The user is responsible for provider billing.
- Prefer direct browser-to-provider requests only when the provider supports browser access/CORS and the integration is safe and practical. Clearly explain that the key and selected document text are sent to that provider.
- Never silently proxy requests through an application server. A proxy requires explicit product approval and a clear privacy/security design.
- Do not store API keys persistently by default. If a remember-key option is implemented, make it opt-in, explain browser storage risks, mask the key, provide a clear/delete action, and never log it.
- Never hardcode real API keys, put them in source control, or expose secrets in build-time public environment variables.
- Never promise that browser-side encryption protects secrets against same-origin XSS or a compromised app.
- Do not silently switch to a paid provider/model or invoke paid fallback. Paid fallback must be explicit, off by default, and confirmed by the user.
- Clearly show provider/model selection and any available quota/usage data. If a provider does not expose quota/billing data, label estimates as estimates and state the limitation.
- Do not claim exact cost when the provider pricing, tokenization, input modality, or usage data is unknown.
- Add configurable guardrails: maximum input characters/tokens, maximum output tokens, per-request estimates where feasible, warning threshold, daily/monthly budget or usage caps, maximum concurrent requests, bounded retries, and request timeout/cancellation.
- Prefer stopping or asking for confirmation when a user-set budget/limit is reached. Never silently exceed it.
- Retry only transient errors, with bounded backoff. Do not repeatedly retry quota, authentication, validation, or billing errors.
- Avoid duplicate submissions; provide progress, cancellation, and clear error states.
- Do not send a full document when the user selected a paragraph or requested a limited operation. Respect the selected-text/paragraph scope.
- AI transformations must preserve user intent and avoid fabricating document content. Offer review/accept/reject rather than silently overwriting source text.

## 6. Offline behavior and cache

Offline functionality must not depend on a local AI model.

Built-in deterministic offline tools may include:

- whitespace and line-break cleanup;
- OCR line reflow and paragraph reconstruction;
- common OCR hyphenation repair, with conservative rules;
- duplicate-line detection;
- Unicode and punctuation normalization;
- basic heading/paragraph heuristics.

These tools must be predictable, explainable, and non-destructive. Preview changes and allow undo/revert. Do not claim deterministic heuristics are AI.

An optional AI Result Cache may reuse an earlier result only for an exact matching normalized request, including relevant task, language, model/provider identity, and prompt/version settings.

- Cache reuse is not general offline AI or inference.
- Cache should be opt-in or clearly configurable, bounded by size, expiry, and privacy controls.
- Keep cache separate from source documents and provide clear-cache controls.
- Avoid caching sensitive content by default. Disclose what is cached and where it is stored.
- A cache miss while offline must produce a clear unavailable state, not a fabricated response.

## 7. OCR and language packs

- English and Burmese OCR language data are bundled by default, subject to practical package-size and licensing constraints.
- Other supported language packs should be discoverable in Settings and installable on demand.
- If the user selects a language whose pack is missing, offer a beginner-friendly one-click install/download and then continue the requested OCR workflow.
- Show package size, download/install status, progress, failure, retry, and removal where applicable.
- Use trusted sources; pin versions and verify checksums/signatures where available.
- Check compatibility and licenses before installing packages.
- Do not execute arbitrary downloaded JavaScript or treat a language data package as executable code.
- Keep optional heavy modules optional when that improves startup or memory use, but do not remove useful packages solely because the product is a web app.
- Explain browser limitations and fall back gracefully when a package or feature is unsupported.

## 8. Editor and document processing

- The editor must support ordinary manual editing without AI.
- AI actions on selected text should be contextual, such as a floating toolbar/popup.
- Translation UI should include source text/scope, target language, a clear action, result preview, and accept/copy/replace options as appropriate.
- OCR cleanup/reflow must handle paragraph-sized chunks with explicit limits to reduce latency and API use.
- Preserve document structure where possible: paragraphs, headings, lists, tables, page breaks, and reading order.
- Do not silently discard source content or overwrite a document without a reversible action.
- Keep large-document operations responsive and provide progress/cancel controls.
- Support undo/redo for editing and transformations where practical.

## 9. Security, privacy, and dependencies

- Treat imported files, OCR output, AI output, and downloaded metadata as untrusted input.
- Sanitize HTML and prevent XSS, especially in rich-text rendering, import, paste, and AI output.
- Use a restrictive Content Security Policy appropriate to the app and configured providers.
- Audit dependencies; prefer maintained, minimal, pinned dependencies and review licenses.
- Do not use `eval`, arbitrary dynamic code execution, or unsafe HTML insertion without a reviewed sanitizer and justified need.
- Validate file types, sizes, and parser limits. Handle malformed/corrupt files safely.
- Do not expose keys or private content in errors, logs, crash reports, URLs, or analytics.
- Provide a clear disclosure before external AI processing.
- Use least privilege for any browser permissions; avoid permissions that are not essential.

## 10. UX, accessibility, and quality

- Responsive layouts must work on mobile, tablet, and desktop.
- Provide light/dark theme support if consistent with the product requirements.
- Use accessible labels, keyboard navigation, visible focus, semantic structure, and sufficient contrast.
- Include loading, empty, success, partial, offline, unsupported, and error states.
- Avoid blocking dialogs for routine operations; use confirmations for destructive actions and paid AI use.
- Respect reduced-motion preferences.
- Do not use decorative animation at the expense of performance or readability.
- Keep user-facing language clear and beginner-friendly; explain technical terms when needed.

## 11. Testing and verification

For each change:

- Run relevant lint, type-check, tests, and production build when scripts exist.
- Add or update tests for important behavior and regression risks.
- Test offline and online states for PWA-related changes.
- Test at least one narrow/mobile viewport and one desktop viewport for UI changes.
- Test storage migrations and error paths when persistence changes.
- For OCR, test representative English and Burmese samples, including low-quality scans where available.
- For AI, test missing key, invalid key, quota/rate limit, network failure, cancellation, output limit, and budget threshold.
- Do not fabricate test results. Report exactly what was run and what could not be verified.

## 12. Implementation workflow and communication

- Work in small, reviewable increments.
- Before major architectural changes, summarize the proposal and ask for approval.
- Do not replace the whole application or rewrite unrelated files to solve a focused issue.
- Do not delete existing functionality without explicit approval.
- Keep documentation, configuration, and tests in sync with behavior.
- If a requirement is ambiguous or technically infeasible, explain the trade-off and ask a focused question.
- When finishing, summarize changed files, behavior, tests run, known limitations, and any setup steps.


## 13. Confirmed workspace and AI Assistant UX

These are explicit product-owner decisions and override earlier mockup assumptions:

- The workspace's primary layout consists of exactly two main panels: **Source** and **Editor**.
- The two panels start at equal widths by default.
- A draggable splitter lets users resize the panels. Keep both usable and enforce sensible minimum widths; preserve the user's chosen split where practical.
- The left navigation sidebar must be collapsible. It should default to a compact/icon-only state in the workspace rather than occupying a permanently wide area. Provide an accessible expand/collapse control and tooltips/labels.
- Do not clutter the workspace with extra permanent panels, dashboards, settings cards, or decorative layout sections.
- The Source panel is an interactive document canvas/viewer, not a static image display. It must support practical source inspection and selection workflows: page navigation, zoom/pan, text selection when available, and drag-to-select image regions for OCR or focused actions. Clearly distinguish selected regions and provide contextual actions.
- Keep source page thumbnails/navigation within the Source panel, preferably collapsible or compact so they do not crowd the source canvas.
- AI Assistant invocation should show a clean assistant/chat experience. Do not expose provider, model, token, budget, or API-key configuration in the assistant's everyday conversation UI.
- AI setup, provider/model selection, API key management, and usage limits belong in Settings.
- Assistant actions should respect the selected source text/region or editor selection. The user should understand what content is being sent to the provider.
- Assistant output should offer relevant actions such as copy, insert, replace/accept, or retry, without silently changing the document.
- Responsive behavior may adapt the two-panel desktop workspace to tabs/stacked panels on narrow screens, but must preserve access to both Source and Editor and avoid cramped unusable panes.
- The supplied reference mockup image is a visual guide, not a source of additional product functionality. Implement the written requirements; do not copy incidental labels, invented content, or decorative details from the image as hard requirements.
