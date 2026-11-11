import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { DEFAULT_REFINEMENT_PARAMS, type RefinementParams } from '@/domain/refinement';
import type { SourceAsset } from '@/domain/document';
import { ImageRefineDialog } from './ImageRefineDialog';

const mocks = vi.hoisted(() => ({
  refineImage: vi.fn(),
  createDownscaledDataUrl: vi.fn(),
  decodeImageBlob: vi.fn(),
  suggestAutoRefine: vi.fn(),
  requestAiImageRefinement: vi.fn(),
  loadAiSettings: vi.fn(),
  getActiveApiKey: vi.fn(),
  providerSupportsImageInput: vi.fn(),
}));

vi.mock('@/services/image/refineClient', () => ({ refineImage: mocks.refineImage }));
vi.mock('@/services/image/codec', () => ({
  createDownscaledDataUrl: mocks.createDownscaledDataUrl,
  decodeImageBlob: mocks.decodeImageBlob,
}));
vi.mock('@/services/image/pipeline', () => ({ suggestAutoRefine: mocks.suggestAutoRefine }));
vi.mock('@/services/ai/imageRefinement', () => ({
  requestAiImageRefinement: mocks.requestAiImageRefinement,
  mergeAiRefinementParams: (base: RefinementParams, report: { recommendations: object }) => ({
    ...base,
    ...report.recommendations,
  }),
}));
vi.mock('@/services/ai/settings', () => ({ loadAiSettings: mocks.loadAiSettings }));
vi.mock('@/services/ai/keys', () => ({ getActiveApiKey: mocks.getActiveApiKey }));
vi.mock('@/services/ai/providers', () => ({
  providerSupportsImageInput: mocks.providerSupportsImageInput,
}));

const asset: SourceAsset = {
  id: 'asset-1',
  blob: new Blob(['original-scan'], { type: 'image/png' }),
  mimeType: 'image/png',
  fileName: 'scan.png',
  size: 13,
  createdAt: 0,
};

function lastParams(): RefinementParams {
  const calls = mocks.refineImage.mock.calls;
  return calls[calls.length - 1]?.[1] as RefinementParams;
}

function renderDialog(
  options: {
    hasSavedRefinement?: boolean;
    onApply?: (result: unknown) => Promise<void>;
    onRevert?: () => Promise<void>;
  } = {},
) {
  return render(
    <ImageRefineDialog
      open
      asset={asset}
      hasSavedRefinement={options.hasSavedRefinement ?? false}
      onClose={() => undefined}
      onApply={options.onApply ?? (async () => undefined)}
      onRevert={options.onRevert ?? (async () => undefined)}
      onOpenSettings={() => undefined}
    />,
  );
}

beforeEach(async () => {
  localStorage.clear();
  mocks.refineImage.mockReset().mockResolvedValue({
    blob: new Blob(['refined'], { type: 'image/png' }),
    width: 1200,
    height: 900,
    scale: 1,
    deskewAngle: 0,
  });
  mocks.createDownscaledDataUrl.mockReset().mockResolvedValue({
    dataUrl: 'data:image/jpeg;base64,AAAA',
    width: 1200,
    height: 900,
  });
  mocks.decodeImageBlob.mockReset().mockResolvedValue({
    width: 8,
    height: 8,
    data: new Uint8ClampedArray(8 * 8 * 4),
  });
  mocks.suggestAutoRefine.mockReset().mockReturnValue({
    report: {
      width: 1200,
      height: 900,
      brightness: 42,
      contrast: 28,
      sharpness: 60,
      noise: 20,
      skewDegrees: 1.5,
      darkRatio: 0.1,
      backgroundVariation: 12,
      issues: [{ code: 'low-contrast', severity: 'medium' }],
      recommendedPreset: 'low-contrast',
      recommendedParams: { ...DEFAULT_REFINEMENT_PARAMS, contrast: 30, deskew: true },
    },
    params: { ...DEFAULT_REFINEMENT_PARAMS, contrast: 30, deskew: true },
  });
  mocks.requestAiImageRefinement.mockReset();
  mocks.loadAiSettings.mockReset().mockReturnValue({
    providerId: 'openai',
    model: 'vision-model',
    customBaseUrl: '',
    rememberKey: false,
    guardrails: {
      maxInputChars: 6000,
      maxOutputTokens: 1024,
      timeoutMs: 30000,
      maxRetries: 1,
      maxConcurrent: 1,
      dailyRequestLimit: 50,
      monthlyRequestLimit: 500,
      warningThreshold: 80,
    },
    cache: { enabled: false, expiryDays: 7, maxEntries: 50 },
  });
  mocks.getActiveApiKey.mockReset().mockReturnValue({
    id: 'key-1',
    providerId: 'openai',
    label: 'Test',
    key: 'test-key',
    createdAt: 0,
  });
  mocks.providerSupportsImageInput.mockReset().mockReturnValue(true);
  await i18n.changeLanguage('en');
});

describe('ImageRefineDialog', () => {
  it('runs the local pipeline for a preset and supports undo and redo', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => expect(mocks.refineImage).toHaveBeenCalled());
    const handwriting = screen.getByRole('button', { name: 'Handwriting' });
    await waitFor(() => expect(handwriting).toBeEnabled());
    await user.click(handwriting);

    await waitFor(() => expect(lastParams().sharpen).toBe(10));
    expect(lastParams().denoise).toBe(8);

    await user.click(screen.getByRole('button', { name: 'Undo adjustment' }));
    await waitFor(() => expect(lastParams()).toEqual(DEFAULT_REFINEMENT_PARAMS));

    await user.click(screen.getByRole('button', { name: 'Redo adjustment' }));
    await waitFor(() => expect(lastParams().sharpen).toBe(10));
  });

  it('tracks slider edits in history and keeps the original image untouched', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onApply });

    const slider = await screen.findByLabelText('Brightness');
    await waitFor(() => expect(slider).toBeEnabled());
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '25' } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(lastParams().brightness).toBe(25));

    await user.click(screen.getByRole('button', { name: 'Undo adjustment' }));
    await waitFor(() => expect(lastParams().brightness).toBe(0));

    const applyButton = screen.getByRole('button', { name: 'Apply refined image' });
    await waitFor(() => expect(applyButton).toBeEnabled());
    await user.click(applyButton);

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const result = onApply.mock.calls[0]?.[0] as {
      blob: Blob;
      params: RefinementParams;
      width: number;
      height: number;
    };
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.params).toEqual(DEFAULT_REFINEMENT_PARAMS);
    expect(result.width).toBe(1200);
    // Applying uses the full-resolution pipeline.
    const applyCall = mocks.refineImage.mock.calls.at(-1);
    expect(applyCall?.[2]).toMatchObject({ maxDimension: 4096 });
    // The original asset was never replaced.
    expect(asset.blob.type).toBe('image/png');
    expect(asset.blob.size).toBe(13);
  });

  it('applies locally measured auto-refine suggestions', async () => {
    const user = userEvent.setup();
    renderDialog();

    const autoRefine = screen.getByRole('button', { name: 'Auto refine' });
    await waitFor(() => expect(autoRefine).toBeEnabled());
    await user.click(autoRefine);

    const heading = await screen.findByText('Image quality');
    const section = heading.closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText('Low contrast')).toBeInTheDocument();
    await waitFor(() => expect(lastParams().contrast).toBe(30));
    expect(lastParams().deskew).toBe(true);
  });

  it('requests AI analysis and applies AI suggestions to local controls', async () => {
    const user = userEvent.setup();
    mocks.requestAiImageRefinement.mockResolvedValue({
      summary: 'The scan is noisy and slightly skewed.',
      issues: [{ code: 'noise', severity: 'high' }],
      recommendedPreset: 'camera',
      recommendations: { denoise: 60 },
    });
    renderDialog();

    const analyze = screen.getByRole('button', { name: 'AI analyze' });
    await waitFor(() => expect(analyze).toBeEnabled());
    await user.click(analyze);

    expect(await screen.findByText('The scan is noisy and slightly skewed.')).toBeInTheDocument();
    expect(mocks.requestAiImageRefinement).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'analysis',
        image: { dataUrl: 'data:image/jpeg;base64,AAAA', mimeType: 'image/jpeg' },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Apply AI suggestions' }));
    await waitFor(() => expect(lastParams().denoise).toBe(60));
  });

  it('disables AI actions when the provider cannot accept images', async () => {
    mocks.providerSupportsImageInput.mockReturnValue(false);
    renderDialog();

    expect(screen.getByRole('button', { name: 'AI analyze' })).toBeDisabled();
    expect(
      screen.getByText(/The selected provider does not accept image input/),
    ).toBeInTheDocument();
  });

  it('reverts the saved refined copy without touching the original', async () => {
    const user = userEvent.setup();
    const onRevert = vi.fn().mockResolvedValue(undefined);
    renderDialog({ hasSavedRefinement: true, onRevert });

    const revert = screen.getByRole('button', { name: 'Revert to original' });
    await waitFor(() => expect(revert).toBeEnabled());
    await user.click(revert);

    expect(onRevert).toHaveBeenCalledTimes(1);
  });
});
