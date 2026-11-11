import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePanScroll } from './usePanScroll';

function PanSurface({ enabled }: { enabled: boolean }) {
  const pan = usePanScroll(enabled, { label: 'Hand tool' });
  return (
    <div
      ref={pan.containerRef}
      data-testid="surface"
      data-panning={pan.panning ? 'true' : 'false'}
      {...pan.surfaceProps}
    />
  );
}

function setScroll(element: HTMLElement, scrollLeft: number, scrollTop: number) {
  Object.defineProperty(element, 'scrollLeft', { value: scrollLeft, writable: true });
  Object.defineProperty(element, 'scrollTop', { value: scrollTop, writable: true });
  Object.defineProperty(element, 'scrollHeight', { value: 900, writable: true });
}

describe('usePanScroll', () => {
  it('pans the container while dragging with the hand tool enabled', () => {
    render(<PanSurface enabled />);
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

  it('ignores the drag and keeps the container untouched when disabled', () => {
    render(<PanSurface enabled={false} />);
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
    render(<PanSurface enabled />);
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

  it('does not handle arrow keys while disabled', () => {
    render(<PanSurface enabled={false} />);
    const surface = screen.getByTestId('surface');
    setScroll(surface, 100, 100);

    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(surface.scrollLeft).toBe(100);
  });
});
