import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface DragOrigin {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

interface PinchOrigin {
  distance: number;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  midX: number;
  midY: number;
}

export interface PinchZoomConfig {
  /** Current zoom level, in the viewer's own zoom unit. */
  zoom: number;
  min: number;
  max: number;
  onChange: (zoom: number) => void;
}

interface ImageGesturesOptions {
  /** Whether the hand tool is armed for drag-to-pan. */
  pan: boolean;
  /** Accessible name for the gesture surface while panning is armed. */
  label: string;
  /** Enables two-finger pinch zoom. Works with or without the hand tool. */
  pinch?: PinchZoomConfig | undefined;
  /** Distance in pixels moved per arrow-key press. */
  keyboardStep?: number;
}

const DEFAULT_KEYBOARD_STEP = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Pan and pinch gestures for scrollable image viewers. It only drives the
 * existing scroll container and reports zoom changes, so zoom buttons, fit,
 * rotation and refinement controls keep using the viewers' own state.
 */
export function useImageGestures(options: ImageGesturesOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragOrigin | null>(null);
  const pinchRef = useRef<PinchOrigin | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const [panning, setPanning] = useState(false);
  const keyboardStep = options.keyboardStep ?? DEFAULT_KEYBOARD_STEP;
  const { pan: panEnabled, pinch } = options;

  const endPan = () => {
    dragRef.current = null;
    setPanning(false);
  };

  const endPinch = () => {
    pinchRef.current = null;
  };

  const startPinch = () => {
    const container = containerRef.current;
    const points = Array.from(pointersRef.current.values());
    if (!container || !pinch || points.length < 2) {
      return;
    }
    const [first, second] = points as [{ x: number; y: number }, { x: number; y: number }];
    const bounds = container.getBoundingClientRect();
    pinchRef.current = {
      distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
      zoom: pinch.zoom,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      midX: (first.x + second.x) / 2 - bounds.left,
      midY: (first.y + second.y) / 2 - bounds.top,
    };
  };

  const applyPinch = (event: PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    const origin = pinchRef.current;
    const points = Array.from(pointersRef.current.values());
    if (!container || !origin || !pinch || points.length < 2) {
      return false;
    }
    const [first, second] = points as [{ x: number; y: number }, { x: number; y: number }];
    const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
    const nextZoom = clamp(origin.zoom * (distance / origin.distance), pinch.min, pinch.max);
    const scale = nextZoom / origin.zoom;
    pinch.onChange(nextZoom);

    // Keep the point under the fingers in place, but apply the scroll offset
    // after the viewer has re-laid out the resized content.
    const nextLeft = (origin.scrollLeft + origin.midX) * scale - origin.midX;
    const nextTop = (origin.scrollTop + origin.midY) * scale - origin.midY;
    requestAnimationFrame(() => {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      element.scrollLeft = nextLeft;
      element.scrollTop = nextTop;
    });

    event.preventDefault();
    return true;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!panEnabled && !pinch) {
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (pointersRef.current.size >= 2) {
      // A second finger always means pinch, never pan.
      endPan();
      startPinch();
      event.preventDefault();
      return;
    }

    if (!panEnabled || event.button !== 0) {
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
    // Keep focus on the surface so arrow-key panning works right after a drag.
    event.currentTarget.focus?.({ preventScroll: true });
    // Suppress text selection and native image dragging while panning.
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (applyPinch(event)) {
      return;
    }

    const drag = dragRef.current;
    const container = containerRef.current;
    if (!panEnabled || !drag || !container || drag.pointerId !== event.pointerId) {
      return;
    }
    container.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    container.scrollTop = drag.scrollTop - (event.clientY - drag.y);
    event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      endPinch();
    }
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
    if (!panEnabled) {
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
      ...(panEnabled ? { tabIndex: 0, role: 'group' as const, 'aria-label': options.label } : {}),
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        pointersRef.current.delete(event.pointerId);
        endPinch();
        endPan();
      },
      onKeyDown,
      onDragStart: (event: { preventDefault: () => void }) => {
        if (panEnabled) {
          // Stop the browser's native image drag from hijacking the gesture.
          event.preventDefault();
        }
      },
    },
  };
}
