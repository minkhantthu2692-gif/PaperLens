/* eslint-disable react-refresh/only-export-components -- The fallback is intentionally colocated with the boundary. */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

function ErrorFallback() {
  const { t } = useTranslation();
  return (
    <div className={styles.wrapper} role="alert">
      <span className={styles.icon}>
        <AlertTriangle size={24} aria-hidden="true" />
      </span>
      <h1 className={styles.title}>{t('errors.title')}</h1>
      <p className={styles.description}>{t('errors.description')}</p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        {t('errors.reload')}
      </Button>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally no logging: error details may contain document content.
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
