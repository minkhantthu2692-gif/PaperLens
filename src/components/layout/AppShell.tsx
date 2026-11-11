import { Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { FocusModeProvider } from './FocusModeProvider';
import { useFocusMode } from './FocusModeContext';
import styles from './AppShell.module.css';

function ShellLayout() {
  const { isFocusMode } = useFocusMode();

  return (
    <div className={clsx(styles.shell, isFocusMode && styles.focusShell)}>
      <Sidebar />
      <div className={styles.workspace}>
        <div className={styles.outlet}>
          <Outlet />
        </div>
        {!isFocusMode ? <StatusBar /> : null}
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <FocusModeProvider>
      <ShellLayout />
    </FocusModeProvider>
  );
}
