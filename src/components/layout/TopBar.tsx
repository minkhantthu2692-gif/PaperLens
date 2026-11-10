import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import styles from './TopBar.module.css';

interface TopBarProps {
  title: ReactNode;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: ReactNode;
}

export function TopBar({ title, subtitle, onBack, backLabel, actions }: TopBarProps) {
  const { t } = useTranslation();

  return (
    <header className={styles.topbar}>
      <div className={styles.leading}>
        {onBack ? (
          <Button
            variant="ghost"
            iconOnly
            onClick={onBack}
            aria-label={backLabel ?? t('common.back')}
            title={backLabel ?? t('common.back')}
          >
            <ArrowLeft size={19} aria-hidden="true" />
          </Button>
        ) : null}
        <div className={styles.titles}>
          <div className={styles.title} role="heading" aria-level={1}>
            {title}
          </div>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
