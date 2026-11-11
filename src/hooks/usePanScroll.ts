import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface DragOrigin {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

interface PanScrollOptions {
  /** Accessible name for the pannable surface while the tool is active. */
  label: string;
  /** Distance in pixels moved per arrow-key press. */
  keyboardStep?: number;
}

const DEFAULT_KEYBOARD_STEP = 48;

/**
 * Hand tool for scrollable image viewers. While enabled, dragging inside the
 * scroll container pans it (mouse, touch and pen) and the arrow keys pan it
 * when focused. It only drives the existing scroll container, so zoom, fit and
 * scroll offsets stay exactly as the viewer left them when the tool is toggled.
 */
export function usePanScroll(enabled: boolean, options: PanScrollOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragOrigin | null>(null);
  const [panning, setPanning] = useState(false);
  const keyboardStep = options.keyboardStep ?? DEFAULT_KEYBOARD_STEP;

  const endPan = () => {
    dragRef.current = null;
    setPanning(false);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
    setPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Keep focus on the surface so arrow-key panning works right after a drag.
    event.currentTarget.focus?.({ preventScroll: true });
    // Suppress text selection and native image dragging while panning.
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!enabled || !drag || !container || drag.pointerId !== event.pointerId) {
      return;
    }
    container.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    container.scrollTop = drag.scrollTop - (event.clientY - drag.y);
    event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const target = event.currentTarget;
    if (target.hasPointerCapture?.(drag.pointerId)) {
      target.releasePointerCapture(drag.pointerId);
    }
    endPan();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const step = event.shiftKey ? keyboardStep * 4 : keyboardStep;
    switch (event.key) {
      case 'ArrowLeft':
        container.scrollLeft -= step;
        break;
      case 'ArrowRight':
        container.scrollLeft += step;
        break;
      case 'ArrowUp':
        container.scrollTop -= step;
        break;
      case 'ArrowDown':
        container.scrollTop += step;
        break;
      case 'Home':
        container.scrollTop = 0;
        break;
      case 'End':
        container.scrollTop = container.scrollHeight;
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return {
    containerRef,
    panning,
    surfaceProps: {
      ...(enabled ? { tabIndex: 0, role: 'group' as const, 'aria-label': options.label } : {}),
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: endPan,
      onKeyDown,
      onDragStart: (event: { preventDefault: () => void }) => {
        if (enabled) {
          // Stop the browser's native image drag from hijacking the gesture.
          event.preventDefault();
        }
      },
    },
  };
}
