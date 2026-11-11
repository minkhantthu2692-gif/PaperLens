import { createContext, useContext } from 'react';

export interface FocusModeContextValue {
  isFocusMode: boolean;
  setFocusMode: (enabled: boolean) => void;
  fullWorkspaceEnabled: boolean;
  setFullWorkspaceEnabled: (enabled: boolean) => void;
  fullscreenError: boolean;
  clearFullscreenError: () => void;
}

export const FocusModeContext = createContext<FocusModeContextValue | null>(null);

export function useFocusMode(): FocusModeContextValue {
  const context = useContext(FocusModeContext);
  if (!context) {
    throw new Error('useFocusMode must be used within FocusModeProvider');
  }
  return context;
}
