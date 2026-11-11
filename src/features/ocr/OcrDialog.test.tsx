import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import type { SourceAsset } from '@/domain/document';
import { createOcrSession } from '@/services/ocr/ocrEngine';
import { listInstalledLanguageCodes } from '@/services/ocr/languagePacks';
import { OcrDialog } from './OcrDialog';

const ocrMocks = vi.hoisted(() => ({
  recognize: vi.fn(),
  terminate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/ocr/ocrEngine', () => ({
  isValidLanguageExpression: (value: string) => /^[a-z0-9_]+$/i.test(value),
  createOcrSession: vi.fn(),
}));

vi.mock('@/services/ocr/languagePacks', () => ({
  getOptionalLanguagePack: () => undefined,
  listInstalledLanguageCodes: vi.fn(),
}));

const asset: SourceAsset = {
  id: 'asset-1',
  blob: new Blob(['fake-image'], { type: 'image/png' }),
  mimeType: 'image/png',
  fileName: 'scan.png',
  size: 10,
  createdAt: 0,
};

function renderDialog(onInsert = vi.fn(), onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <OcrDialog
        target={{ kind: 'image' }}
        sourceAsset={asset}
        onClose={onClose}
        onInsert={onInsert}
      />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  ocrMocks.recognize.mockReset();
  ocrMocks.terminate.mockResolvedValue(undefined);
  vi.mocked(listInstalledLanguageCodes).mockResolvedValue(new Set());
  vi.mocked(createOcrSession).mockResolvedValue({
    recognize: ocrMocks.recognize,
    terminate: ocrMocks.terminate,
  });
  await i18n.changeLanguage('en');
});

describe('OcrDialog', () => {
  it('recognizes text and inserts the reconstructed result', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    ocrMocks.recognize.mockResolvedValue('Hello\nworld');
    renderDialog(onInsert);

    await user.click(screen.getByRole('button', { name: 'Start OCR' }));

    expect(await screen.findByText('Hello world')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Insert into editor' }));

    expect(onInsert).toHaveBeenCalledWith('Hello world');
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

    await user.click(screen.getByRole('button', { name: 'Start OCR' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel OCR' }));

    expect(await screen.findByText('OCR was cancelled.')).toBeInTheDocument();
    expect(ocrMocks.terminate).toHaveBeenCalled();

    finish('Late result');
    await waitFor(() => expect(screen.queryByText('Late result')).not.toBeInTheDocument());
    expect(onInsert).not.toHaveBeenCalled();
  });
});
