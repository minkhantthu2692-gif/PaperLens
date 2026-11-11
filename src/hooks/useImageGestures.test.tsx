import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useImageGestures } from './useImageGestures';

interface SurfaceProps {
  pan?: boolean;
  pinch?: boolean;
  onZoomChange?: (zoom: number) => void;
  onPanningChange?: (panning: boolean) => void;
}

function Surface({ pan = true, pinch = true, onZoomChange, onPanningChange }: SurfaceProps) {
  const [zoom, setZoom] = useState(1);
  const gestures = useImageGestures({
    pan,
    label: 'Hand tool',
    ...(pinch
      ? {
          pinch: {
            zoom,
            min: 0.5,
            max: 4,
            onChange: (next: number) => {
              setZoom(next);
              onZoomChange?.(next);
            },
          },
        }
      : {}),
  });
  onPanningChange?.(gestures.panning);
  return (
    <div
      ref={gestures.containerRef}
      data-testid="surface"
      data-zoom={zoom}
      data-panning={gestures.panning ? 'true' : 'false'}
      {...gestures.surfaceProps}
    />
  );
}

function setScroll(element: HTMLElement, scrollLeft: number, scrollTop: number) {
  Object.defineProperty(element, 'scrollLeft', { value: scrollLeft, writable: true });
  Object.defineProperty(element, 'scrollTop', { value: scrollTop, writable: true });
  Object.defineProperty(element, 'scrollHeight', { value: 900, writable: true });
}

function touch(
  element: HTMLElement,
  pointerId: number,
  x: number,
  y: number,
  type: 'down' | 'move' | 'up',
) {
  const event = { pointerId, clientX: x, clientY: y, button: 0 };
  if (type === 'down') {
    fireEvent.pointerDown(element, event);
  } else if (type === 'move') {
    fireEvent.pointerMove(element, event);
  } else {
    fireEvent.pointerUp(element, event);
  }
}

describe('useImageGestures', () => {
  it('pans the container while dragging with the hand tool enabled', () => {
    render(<Surface />);
    const surface = screen.getByTestId('surface');
    setScroll(surface, 200, 150);

    fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 300, clientY: 300 });
    expect(surface).toHaveAttribute('data-panning', 'true');

    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 250, clientY: 280 });
    expect(surface.scrollLeft).toBe(250);
    expect(surface.scrollTop).toBe(170);

    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(surface).toHaveAttribute('data-panning', 'false');
  });

  it('ignores the drag and keeps the container untouched when the hand tool is off', () => {
    render(<Surface pan={false} />);
    const surface = screen.getByTestId('surface');
    setScroll(surface, 120, 90);

    expect(surface).not.toHaveAttribute('tabindex');
    expect(surface).not.toHaveAttribute('role');

    fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(surface.scrollLeft).toBe(120);
    expect(surface.scrollTop).toBe(90);
    expect(surface).toHaveAttribute('data-panning', 'false');
  });

  it('pans with the keyboard when focused', () => {
    render(<Surface />);
    const surface = screen.getByTestId('surface');
    setScroll(surface, 100, 100);
    expect(surface).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(surface.scrollLeft).toBe(148);
    fireEvent.keyDown(surface, { key: 'ArrowDown', shiftKey: true });
    expect(surface.scrollTop).toBe(292);
    fireEvent.keyDown(surface, { key: 'Home' });
    expect(surface.scrollTop).toBe(0);
    fireEvent.keyDown(surface, { key: 'End' });
    expect(surface.scrollTop).toBe(900);
  });

  it('does not handle arrow keys while the hand tool is off', () => {
    render(<Surface pan={false} />);
    const surface = screen.getByTestId('surface');
    setScroll(surface, 100, 100);

    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(surface.scrollLeft).toBe(100);
  });

  it('zooms with a two-finger pinch and keeps the pinch midpoint anchored', async () => {
    const onZoomChange = vi.fn();
    render(<Surface pan={false} onZoomChange={onZoomChange} />);
    const surface = screen.getByTestId('surface');
    setScroll(surface, 100, 80);

    // Two touches 100px apart, then spread to 200px apart (2x zoom).
    touch(surface, 1, 100, 200, 'down');
    touch(surface, 2, 200, 200, 'down');
    touch(surface, 2, 300, 200, 'move');

    expect(onZoomChange).toHaveBeenCalled();
    expect(onZoomChange.mock.calls.at(-1)?.[0]).toBeCloseTo(2, 5);
    expect(surface).toHaveAttribute('data-zoom', '2');
    expect(surface).toHaveAttribute('data-panning', 'false');

    // Midpoint (150, 200); scroll = (scroll + mid) * scale - mid.
    await waitFor(() => expect(surface.scrollLeft).toBe(350));
    expect(surface.scrollTop).toBe(360);

    touch(surface, 2, 300, 200, 'up');
    expect(surface).toHaveAttribute('data-zoom', '2');
  });

  it('clamps pinch zoom to the viewer limits', () => {
    const onZoomChange = vi.fn();
    render(<Surface onZoomChange={onZoomChange} />);
    const surface = screen.getByTestId('surface');
    setScroll(surface, 0, 0);

    touch(surface, 1, 100, 100, 'down');
    touch(surface, 2, 200, 100, 'down');
    touch(surface, 2, 900, 100, 'move');
    expect(onZoomChange.mock.calls.at(-1)?.[0]).toBe(4);

    touch(surface, 2, 101, 100, 'move');
    expect(onZoomChange.mock.calls.at(-1)?.[0]).toBe(0.5);
  });

  it('pans with one finger and zooms when a second finger joins', () => {
    const onZoomChange = vi.fn();
    render(<Surface onZoomChange={onZoomChange} />);
    const surface = screen.getByTestId('surface');
    setScroll(surface, 50, 50);

    touch(surface, 1, 200, 200, 'down');
    touch(surface, 1, 180, 190, 'move');
    expect(surface.scrollLeft).toBe(70);
    expect(surface.scrollTop).toBe(60);

    touch(surface, 2, 280, 200, 'down');
    expect(surface).toHaveAttribute('data-panning', 'false');
    touch(surface, 2, 380, 200, 'move');
    expect(onZoomChange).toHaveBeenCalled();
    expect(surface.scrollLeft).toBe(70);
  });
});
