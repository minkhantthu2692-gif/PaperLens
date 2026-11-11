import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import type { SourceAsset } from '@/domain/document';
import { SourcePanel } from './SourcePanel';

const asset: SourceAsset = {
  id: 'asset-image',
  blob: new Blob(['scan-bytes'], { type: 'image/png' }),
  mimeType: 'image/png',
  fileName: 'scan.png',
  size: 10,
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

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:scan'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

describe('SourcePanel image viewer', () => {
  it('pans the zoomed image with the hand tool and restores native behaviour', async () => {
    const user = userEvent.setup();
    renderPanel();

    const image = screen.getByAltText('scan.png');
    expect(image).toHaveAttribute('draggable', 'false');

    const handTool = screen.getByRole('button', { name: 'Hand tool' });
    expect(handTool).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('group', { name: 'Hand tool' })).toBeNull();

    await user.click(handTool);
    expect(handTool).toHaveAttribute('aria-pressed', 'true');

    const surface = screen.getByRole('group', { name: 'Hand tool' });
    expect(surface).toHaveAttribute('tabindex', '0');
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

  it('keeps the hand tool and region selection mutually exclusive', async () => {
    const user = userEvent.setup();
    renderPanel();

    const handTool = screen.getByRole('button', { name: 'Hand tool' });
    const regionTool = screen.getByRole('button', { name: 'Select region' });

    await user.click(handTool);
    expect(handTool).toHaveAttribute('aria-pressed', 'true');

    await user.click(regionTool);
    expect(regionTool).toHaveAttribute('aria-pressed', 'true');
    expect(handTool).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Drag on the page to select a region.')).toBeInTheDocument();

    await user.click(handTool);
    expect(handTool).toHaveAttribute('aria-pressed', 'true');
    expect(regionTool).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Drag on the page to select a region.')).not.toBeInTheDocument();
  });
});
