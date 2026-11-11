import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, HardDrive, Languages, ShieldCheck, Trash2, Upload } from 'lucide-react';
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
import {
  installLanguagePack,
  isAbortError,
  LanguagePackError,
  listInstalledLanguageCodes,
  OPTIONAL_LANGUAGE_PACKS,
  removeLanguagePack,
  type LanguagePack,
  type LanguagePackErrorCode,
} from '@/services/ocr/languagePacks';
import { BackupError, createBackup, restoreBackup } from '@/services/storage/backup';
import { deleteAllLocalData, getStorageUsage } from '@/services/storage/documents';
import styles from './SettingsPage.module.css';

const THEME_LABEL_KEYS = {
  light: 'theme.light',
  dark: 'theme.dark',
  system: 'theme.system',
} as const satisfies Record<ThemePreference, string>;

type Feedback = { type: 'success' | 'error'; text: string } | null;

type PackStatus = 'idle' | 'downloading' | 'installed' | 'error';

interface PackState {
  status: PackStatus;
  progress: number;
  error?: LanguagePackErrorCode;
}

type PackErrorKey =
  | 'settings.packErrorNetwork'
  | 'settings.packErrorHttp'
  | 'settings.packErrorIntegrity'
  | 'settings.packErrorUnsupported';

function packErrorKey(code: LanguagePackErrorCode): PackErrorKey {
  switch (code) {
    case 'http':
      return 'settings.packErrorHttp';
    case 'integrity':
      return 'settings.packErrorIntegrity';
    case 'unsupported':
      return 'settings.packErrorUnsupported';
    default:
      return 'settings.packErrorNetwork';
  }
}

function initialPackStates(installed: Set<string>): Record<string, PackState> {
  const states: Record<string, PackState> = {};
  for (const pack of OPTIONAL_LANGUAGE_PACKS) {
    states[pack.code] = installed.has(pack.code)
      ? { status: 'installed', progress: 1 }
      : { status: 'idle', progress: 0 };
  }
  return states;
}

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
  const [packStates, setPackStates] = useState<Record<string, PackState>>({});
  const packControllers = useRef(new Map<string, AbortController>());

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

  const updatePack = useCallback((code: string, next: PackState) => {
    setPackStates((current) => ({ ...current, [code]: next }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listInstalledLanguageCodes()
      .then((installed) => {
        if (!cancelled) {
          setPackStates(initialPackStates(installed));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPackStates(initialPackStates(new Set()));
        }
      });

    const controllers = packControllers.current;
    return () => {
      cancelled = true;
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);

  const handleInstallPack = async (pack: LanguagePack) => {
    const controller = new AbortController();
    packControllers.current.set(pack.code, controller);
    setFeedback(null);
    updatePack(pack.code, { status: 'downloading', progress: 0 });

    try {
      await installLanguagePack(
        pack,
        (progress) => updatePack(pack.code, { status: 'downloading', progress }),
        controller.signal,
      );
      updatePack(pack.code, { status: 'installed', progress: 1 });
      setFeedback({
        type: 'success',
        text: t('settings.packInstalled', { language: pack.name }),
      });
      await refreshUsage();
    } catch (error) {
      if (isAbortError(error)) {
        updatePack(pack.code, { status: 'idle', progress: 0 });
      } else {
        const code: LanguagePackErrorCode =
          error instanceof LanguagePackError ? error.code : 'network';
        updatePack(pack.code, { status: 'error', progress: 0, error: code });
      }
    } finally {
      packControllers.current.delete(pack.code);
    }
  };

  const handleCancelPack = (code: string) => {
    packControllers.current.get(code)?.abort();
  };

  const handleRemovePack = async (pack: LanguagePack) => {
    setFeedback(null);
    try {
      await removeLanguagePack(pack.code);
      updatePack(pack.code, { status: 'idle', progress: 0 });
      setFeedback({
        type: 'success',
        text: t('settings.packRemoved', { language: pack.name }),
      });
      await refreshUsage();
    } catch {
      setFeedback({ type: 'error', text: t('settings.packRemoveError') });
    }
  };

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

        <section className={styles.card} aria-labelledby="settings-language-packs">
          <h2 id="settings-language-packs">{t('settings.languagePacks')}</h2>
          <p className={styles.cardDescription}>{t('settings.languagePacksDescription')}</p>
          <p className={styles.hint}>{t('settings.bundledPacks')}</p>

          <ul className={styles.packList}>
            {OPTIONAL_LANGUAGE_PACKS.map((pack) => {
              const state = packStates[pack.code] ?? { status: 'idle', progress: 0 };
              return (
                <li key={pack.code} className={styles.packRow}>
                  <div className={styles.packInfo}>
                    <span className={styles.packName}>
                      <Languages size={16} aria-hidden="true" />
                      {pack.nativeName} <span className={styles.packEnglish}>({pack.name})</span>
                    </span>
                    <span className={styles.packMeta}>
                      {formatBytes(pack.size)} · {t('settings.packLicense')}
                    </span>
                  </div>

                  {state.status === 'downloading' ? (
                    <div className={styles.packActions}>
                      <progress
                        className={styles.packProgress}
                        value={Math.round(state.progress * 100)}
                        max={100}
                        aria-label={t('settings.packInstalling', { language: pack.name })}
                      />
                      <span className={styles.packProgressText}>
                        {Math.round(state.progress * 100)}%
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleCancelPack(pack.code)}>
                        {t('settings.cancelPack')}
                      </Button>
                    </div>
                  ) : state.status === 'installed' ? (
                    <div className={styles.packActions}>
                      <span className={styles.packInstalled}>{t('settings.installed')}</span>
                      <Button variant="ghost" size="sm" onClick={() => void handleRemovePack(pack)}>
                        <Trash2 size={15} aria-hidden="true" />
                        {t('settings.removePack')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleInstallPack(pack)}
                    >
                      <Download size={15} aria-hidden="true" />
                      {state.status === 'error' ? t('common.retry') : t('settings.installPack')}
                    </Button>
                  )}

                  {state.status === 'error' && state.error ? (
                    <p className={styles.packError} role="alert">
                      {t(packErrorKey(state.error))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
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
