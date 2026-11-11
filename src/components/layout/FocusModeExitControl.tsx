import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './FocusModeExitControl.module.css';

const HIDE_DELAY_MS = 2500;
const EDGE_SIZE_PX = 16;

interface FocusModeExitControlProps {
  onExit: () => void;
}

export function FocusModeExitControl({ onExit }: FocusModeExitControlProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const clearHideTimer = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = undefined;
  };

  const scheduleHide = () => {
    if (hideTimer.current !== undefined) {
      return;
    }
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = undefined;
      if (document.activeElement !== buttonRef.current && !buttonRef.current?.matches(':hover')) {
        setVisible(false);
      }
    }, HIDE_DELAY_MS);
  };

  useEffect(() => {
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = undefined;
      setVisible(false);
    }, HIDE_DELAY_MS);

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType === 'touch') {
        return;
      }
      const { clientX, clientY } = event;
      const nearEdge =
        clientX <= EDGE_SIZE_PX ||
        clientY <= EDGE_SIZE_PX ||
        clientX >= window.innerWidth - EDGE_SIZE_PX ||
        clientY >= window.innerHeight - EDGE_SIZE_PX;
      if (nearEdge) {
        clearHideTimer();
        setVisible(true);
      } else {
        scheduleHide();
      }
    };
    const handlePointerLeave = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'touch') {
        scheduleHide();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      clearHideTimer();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  const handlePointerEnter = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch') {
      clearHideTimer();
      setVisible(true);
    }
  };

  const handleFocus = () => {
    clearHideTimer();
    setVisible(true);
  };

  const handleBlur = (event: FocusEvent<HTMLButtonElement>) => {
    if (event.relatedTarget !== event.currentTarget) {
      scheduleHide();
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${styles.control} ${visible ? styles.visible : ''}`}
      aria-label={t('workspace.exitFocusMode')}
      title={t('workspace.exitFocusMode')}
      onClick={onExit}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') {
          scheduleHide();
        }
      }}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <Minimize2 size={16} aria-hidden="true" />
    </button>
  );
}
