import { ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  return (
    <footer className={styles.statusbar}>
      <span className={styles.group}>
        <span className={styles.item}>
          {online ? (
            <Wifi size={14} aria-hidden="true" />
          ) : (
            <WifiOff size={14} aria-hidden="true" />
          )}
          {online ? t('status.online') : t('status.offline')}
        </span>
        <span className={styles.item}>
          <ShieldCheck size={14} aria-hidden="true" />
          {t('status.localFirst')}
        </span>
      </span>
      <span className={styles.version}>PaperLens v{__APP_VERSION__}</span>
    </footer>
  );
}
