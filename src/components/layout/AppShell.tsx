import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.workspace}>
        <div className={styles.outlet}>
          <Outlet />
        </div>
        <StatusBar />
      </div>
    </div>
  );
}
