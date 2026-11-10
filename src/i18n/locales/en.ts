export const en = {
  app: {
    name: 'PaperLens',
    tagline: 'Rebuild documents. Keep control.',
    description:
      'PaperLens turns PDFs, scans, and OCR output into clean, editable documents. Documents are processed and stored on your device by default.',
  },
  language: {
    label: 'Language',
    en: 'English',
    my: 'Burmese',
  },
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  status: {
    ready: 'Local workspace ready',
    offline: 'Offline',
  },
  phase0: {
    badge: 'Phase 0',
    title: 'Foundation ready',
    description:
      'Project tooling, design tokens, theming, and localization are in place. Document import, OCR, editing, and export arrive in the next phases.',
    items: {
      tooling: 'Typed build, linting, and automated tests',
      design: 'Design-token system with light and dark themes',
      localization: 'English and Burmese localization foundation',
    },
    next: 'Next up: document workspace, source viewer, editor, and local persistence.',
  },
  privacy: {
    title: 'Your documents stay yours',
    description:
      'Local-first by default. Nothing leaves this device unless you choose to use an external AI provider.',
  },
  footer: {
    version: 'Version {{version}}',
    storageNotice: 'Browser storage can be cleared. Back up your work once backup support lands.',
  },
} as const;
