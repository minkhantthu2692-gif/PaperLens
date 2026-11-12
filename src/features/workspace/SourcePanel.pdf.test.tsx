import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import type { SourceAsset } from '@/domain/document';
import { SourcePanel } from './SourcePanel';

const { getDocumentMock, getPageMock, renderMock, getTextContentMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  getPageMock: vi.fn(),
  renderMock: vi.fn(),
  getTextContentMock: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: getDocumentMock,
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

const asset: SourceAsset = {
  id: 'asset-pdf',
  blob: new Blob(['pdf-bytes'], { type: 'application/pdf' }),
  mimeType: 'application/pdf',
  fileName: 'scan.pdf',
  size: 9,
  createdAt: 0,
};

function renderPanel() {
  return render(
    <SourcePanel
      asset={asset}
      onPageCount={() => undefined}
      onInsertText={() => undefined}
      onOcrPage={() => undefined}
      onOcrImage={() => undefined}
      onOcrRegion={() => undefined}
      onAiText={() => undefined}
      onRefineImage={() => undefined}
      hasRefinedImage={false}
    />,
  );
}

describe('SourcePanel PDF viewer', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en');
    getPageMock.mockReturnValue({
      getViewport: ({ scale }: { scale: number }) => ({ width: 200 * scale, height: 300 * scale }),
      render: renderMock,
      getTextContent: getTextContentMock,
    });
    renderMock.mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
    getTextContentMock.mockResolvedValue({ items: [] });
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: getPageMock,
        destroy: vi.fn(),
      }),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  it('lets the hand tool pan a PDF and toggles back to text selection', async () => {
    const user = userEvent.setup();
    renderPanel();
    const handTool = await screen.findByRole('button', { name: 'Hand tool' });

    expect(handTool).toHaveAttribute('aria-pressed', 'false');
    await user.click(handTool);
    expect(handTool).toHaveAttribute('aria-pressed', 'true');

    const surface = screen.getByRole('group', { name: 'Hand tool' });
    Object.defineProperty(surface, 'scrollLeft', { value: 40, writable: true });
    Object.defineProperty(surface, 'scrollTop', { value: 60, writable: true });
    fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 320, clientY: 320 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 300, clientY: 300 });
    expect(surface.scrollLeft).toBe(60);
    expect(surface.scrollTop).toBe(80);
    fireEvent.pointerUp(surface, { pointerId: 1 });

    await user.click(handTool);
    expect(handTool).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('group', { name: 'Hand tool' })).toBeNull();
  });

  it('shows selected PDF text differently from region-selection mode', async () => {
    const user = userEvent.setup();
    renderPanel();
    const textTool = await screen.findByRole('button', { name: 'Select text' });
    const regionTool = screen.getByRole('button', { name: 'Select region' });
    const handTool = screen.getByRole('button', { name: 'Hand tool' });

    expect(textTool).toHaveAttribute('aria-pressed', 'true');
    expect(regionTool).toHaveAttribute('aria-pressed', 'false');
    expect(handTool).toHaveAttribute('aria-pressed', 'false');

    await user.click(regionTool);
    expect(await screen.findByText('Drag on the page to select a region.')).toBeInTheDocument();
    expect(regionTool).toHaveAttribute('aria-pressed', 'true');
    expect(textTool).toHaveAttribute('aria-pressed', 'false');
  });
});
