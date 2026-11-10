import { useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <span className={styles.icon}>
        <FileQuestion size={26} aria-hidden="true" />
      </span>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.description')}</p>
      <Button variant="primary" onClick={() => navigate('/')}>
        {t('notFound.home')}
      </Button>
    </div>
  );
}
