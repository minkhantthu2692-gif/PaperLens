import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import type { SourceAsset } from '@/domain/document';
import { createOcrSession } from '@/services/ocr/ocrEngine';
import { listInstalledLanguageCodes, type LanguagePack } from '@/services/ocr/languagePacks';
import { OcrDialog } from './OcrDialog';

const ocrMocks = vi.hoisted(() => ({
  recognize: vi.fn(),
  terminate: vi.fn().mockResolvedValue(undefined),
}));

const packMocks = vi.hoisted(() => ({
  install: vi.fn(),
  pack: {
    code: 'spa',
    name: 'Spanish',
    nativeName: 'Español',
    size: 100,
    sha256: 'test-checksum',
    url: 'https://example.com/spa.traineddata',
  } satisfies LanguagePack,
}));

vi.mock('@/services/ocr/ocrEngine', () => ({
  isValidLanguageExpression: (value: string) => /^[a-z0-9_]+$/i.test(value),
  createOcrSession: vi.fn(),
}));

vi.mock('@/services/ocr/languagePacks', () => ({
  OPTIONAL_LANGUAGE_PACKS: [packMocks.pack],
  getOptionalLanguagePack: (code: string) =>
    code === packMocks.pack.code ? packMocks.pack : undefined,
  listInstalledLanguageCodes: vi.fn(),
  installLanguagePack: packMocks.install,
  isAbortError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError',
}));

const asset: SourceAsset = {
  id: 'asset-1',
  blob: new Blob(['fake-image'], { type: 'image/png' }),
  mimeType: 'image/png',
  fileName: 'scan.png',
  size: 10,
  createdAt: 0,
};

function renderDialog(
  onInsert = vi.fn(),
  onClose = vi.fn(),
  onUseWithAssistant?: (text: string) => void,
) {
  return render(
    <MemoryRouter>
      <OcrDialog
        target={{ kind: 'image' }}
        sourceAsset={asset}
        onClose={onClose}
        onInsert={onInsert}
        {...(onUseWithAssistant ? { onUseWithAssistant } : {})}
      />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  localStorage.removeItem('paperlens.ocr.language');
  ocrMocks.recognize.mockReset();
  ocrMocks.terminate.mockResolvedValue(undefined);
  packMocks.install.mockReset();
  packMocks.install.mockResolvedValue(undefined);
  vi.mocked(listInstalledLanguageCodes).mockResolvedValue(new Set());
  vi.mocked(createOcrSession).mockResolvedValue({
    recognize: ocrMocks.recognize,
    terminate: ocrMocks.terminate,
  });
  await i18n.changeLanguage('en');
});

async function clickStart(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole('button', { name: 'Start OCR' });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

describe('OcrDialog', () => {
  it('lets the user choose between the original and refined image', async () => {
    const user = userEvent.setup();
    const refined: SourceAsset = {
      ...asset,
      id: 'asset-refined',
      blob: new Blob(['refined-image'], { type: 'image/png' }),
      fileName: 'scan-refined.png',
    };
    ocrMocks.recognize.mockResolvedValue('Recognized text');
    render(
      <MemoryRouter>
        <OcrDialog
          target={{ kind: 'image' }}
          sourceAsset={asset}
          refinedAsset={refined}
          onClose={vi.fn()}
          onInsert={vi.fn()}
        />
      </MemoryRouter>,
    );

    const select = await screen.findByLabelText('Image to recognize');
    expect(select).toHaveValue('refined');

    await clickStart(user);
    expect(ocrMocks.recognize).toHaveBeenCalledWith(refined.blob, expect.any(Function));

    await user.selectOptions(select, 'original');
    await user.click(await screen.findByRole('button', { name: 'Start OCR' }));
    await waitFor(() =>
      expect(ocrMocks.recognize).toHaveBeenLastCalledWith(asset.blob, expect.any(Function)),
    );
  });

  it('recognizes text and inserts the reconstructed result', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    ocrMocks.recognize.mockResolvedValue('Hello\nworld');
    renderDialog(onInsert);

    await clickStart(user);

    expect(await screen.findByText('Hello world')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Insert into editor' }));

    expect(onInsert).toHaveBeenCalledWith('Hello world');
  });

  it('hands recognized text to the AI Assistant when requested', async () => {
    const user = userEvent.setup();
    const onUseWithAssistant = vi.fn();
    const onClose = vi.fn();
    ocrMocks.recognize.mockResolvedValue('Selected region text');
    renderDialog(vi.fn(), onClose, onUseWithAssistant);

    await clickStart(user);
    await user.click(await screen.findByRole('button', { name: 'Use in AI Assistant' }));

    expect(onUseWithAssistant).toHaveBeenCalledWith('Selected region text');
    expect(onClose).toHaveBeenCalled();
  });

  it('installs a missing language pack and continues OCR', async () => {
    const user = userEvent.setup();
    ocrMocks.recognize.mockResolvedValue('Installed language text');
    renderDialog();

    const checkbox = await screen.findByRole('checkbox', { name: /Español/ });
    await waitFor(() => expect(checkbox).toBeEnabled());
    await user.click(checkbox);
    await user.click(await screen.findByRole('button', { name: 'Install language and start OCR' }));

    expect(packMocks.install).toHaveBeenCalledWith(
      packMocks.pack,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(await screen.findByText('Installed language text')).toBeInTheDocument();
  });

  it('cancels a running recognition and terminates the worker', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    let finish: (value: string) => void = () => undefined;
    ocrMocks.recognize.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    renderDialog(onInsert);

    await clickStart(user);
    await user.click(await screen.findByRole('button', { name: 'Cancel OCR' }));

    expect(await screen.findByText('OCR was cancelled.')).toBeInTheDocument();
    expect(ocrMocks.terminate).toHaveBeenCalled();

    finish('Late result');
    await waitFor(() => expect(screen.queryByText('Late result')).not.toBeInTheDocument());
    expect(onInsert).not.toHaveBeenCalled();
  });
});
