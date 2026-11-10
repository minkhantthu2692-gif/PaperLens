import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StartPoint {
  x: number;
  y: number;
}

const MIN_SIZE = 6;

export function useRegionSelection(enabled: boolean) {
  const [rect, setRect] = useState<SelectionRect | null>(null);
  const startRef = useRef<StartPoint | null>(null);

  const clear = useCallback(() => {
    startRef.current = null;
    setRect(null);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    startRef.current = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    setRect({ x: startRef.current.x, y: startRef.current.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!enabled || !start) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const currentX = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
    const currentY = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height);
    setRect({
      x: Math.min(start.x, currentX),
      y: Math.min(start.y, currentY),
      width: Math.abs(currentX - start.x),
      height: Math.abs(currentY - start.y),
    });
  };

  const onPointerUp = () => {
    startRef.current = null;
    setRect((current) => {
      if (!current || current.width < MIN_SIZE || current.height < MIN_SIZE) {
        return null;
      }
      return current;
    });
  };

  return {
    rect,
    clear,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
