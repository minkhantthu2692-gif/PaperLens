import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, HardDrive, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import formStyles from '@/components/ui/Form.module.css';
import { isThemePreference, THEME_PREFERENCES, type ThemePreference } from '@/app/theme/theme';
import { useTheme } from '@/app/theme/useTheme';
import { isSupportedLanguage, type SupportedLanguage } from '@/i18n';
import { downloadBlob } from '@/lib/file';
import { formatBytes } from '@/lib/format';
import { BackupError, createBackup, restoreBackup } from '@/services/storage/backup';
import { deleteAllLocalData, getStorageUsage } from '@/services/storage/documents';
import styles from './SettingsPage.module.css';

const THEME_LABEL_KEYS = {
  light: 'theme.light',
  dark: 'theme.dark',
  system: 'theme.system',
} as const satisfies Record<ThemePreference, string>;

type Feedback = { type: 'success' | 'error'; text: string } | null;

type RestoreErrorKey =
  | 'settings.backupTooLarge'
  | 'settings.restoreVersion'
  | 'settings.restoreInvalid'
  | 'settings.backupError';

function restoreErrorKey(error: unknown): RestoreErrorKey {
  if (error instanceof BackupError) {
    switch (error.code) {
      case 'too-large':
        return 'settings.backupTooLarge';
      case 'unsupported-version':
        return 'settings.restoreVersion';
      default:
        return 'settings.restoreInvalid';
    }
  }
  return 'settings.backupError';
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { preference, setPreference } = useTheme();
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const language: SupportedLanguage = isSupportedLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : 'en';

  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await getStorageUsage());
    } catch {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  const handleBackup = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const { blob, fileName } = await createBackup();
      downloadBlob(blob, fileName);
      setFeedback({ type: 'success', text: t('settings.backupCreated') });
    } catch {
      setFeedback({ type: 'error', text: t('settings.backupError') });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const count = await restoreBackup(file);
      setFeedback({
        type: 'success',
        text: t('settings.backupRestored', { count }),
      });
      await refreshUsage();
    } catch (error) {
      setFeedback({ type: 'error', text: t(restoreErrorKey(error)) });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAll = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await deleteAllLocalData();
      setDeleteOpen(false);
      setFeedback({ type: 'success', text: t('settings.deleted') });
      await refreshUsage();
    } catch {
      setFeedback({ type: 'error', text: t('settings.backupError') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className={styles.content}>
        {feedback ? (
          <div
            className={feedback.type === 'success' ? formStyles.success : formStyles.alert}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.text}
          </div>
        ) : null}

        <section className={styles.card} aria-labelledby="settings-appearance">
          <h2 id="settings-appearance">{t('settings.appearance')}</h2>
          <p className={styles.cardDescription}>{t('settings.appearanceDescription')}</p>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="settings-theme">
              {t('settings.theme')}
            </label>
            <select
              id="settings-theme"
              className={formStyles.select}
              value={preference}
              onChange={(event) => {
                if (isThemePreference(event.target.value)) {
                  setPreference(event.target.value);
                }
              }}
            >
              {THEME_PREFERENCES.map((option) => (
                <option key={option} value={option}>
                  {t(THEME_LABEL_KEYS[option])}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="settings-language">
              {t('settings.language')}
            </label>
            <select
              id="settings-language"
              className={formStyles.select}
              value={language}
              onChange={(event) => {
                void i18n.changeLanguage(event.target.value);
              }}
            >
              <option value="en">{t('language.en')}</option>
              <option value="my">{t('language.my')}</option>
            </select>
          </div>
          <p className={styles.hint}>{t('settings.languageDescription')}</p>
        </section>

        <section className={styles.card} aria-labelledby="settings-data">
          <h2 id="settings-data">{t('settings.data')}</h2>
          <p className={styles.cardDescription}>{t('settings.dataDescription')}</p>

          <p className={styles.storage}>
            <HardDrive size={17} aria-hidden="true" />
            {usage
              ? t('settings.storageUsed', {
                  usage: formatBytes(usage.usage),
                  quota: formatBytes(usage.quota),
                })
              : t('settings.storageUnavailable')}
          </p>

          <div className={styles.buttonRow}>
            <Button onClick={() => void handleBackup()} disabled={busy}>
              <Download size={17} aria-hidden="true" />
              {t('settings.exportBackup')}
            </Button>
            <Button onClick={() => restoreInputRef.current?.click()} disabled={busy}>
              <Upload size={17} aria-hidden="true" />
              {t('settings.restoreBackup')}
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)} disabled={busy}>
              <Trash2 size={17} aria-hidden="true" />
              {t('settings.deleteAll')}
            </Button>
          </div>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            className={styles.hiddenInput}
            onChange={(event) => void handleRestore(event)}
            aria-label={t('settings.restoreBackup')}
          />
        </section>

        <section className={styles.card} aria-labelledby="settings-about">
          <h2 id="settings-about">{t('settings.about')}</h2>
          <p className={styles.aboutVersion}>
            {t('settings.version', { version: __APP_VERSION__ })}
          </p>
          <ul className={styles.aboutList}>
            <li>{t('settings.supportedFormats')}</li>
            <li>
              <strong>{t('settings.limitationsTitle')}:</strong> {t('settings.limitations')}
            </li>
            <li className={styles.privacy}>
              <ShieldCheck size={16} aria-hidden="true" />
              {t('settings.privacy')}
            </li>
          </ul>
        </section>
      </div>

      <Dialog
        open={deleteOpen}
        title={t('settings.deleteAllTitle')}
        description={t('settings.deleteAllDescription')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void handleDeleteAll()} disabled={busy}>
              {t('settings.deleteAllConfirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}
