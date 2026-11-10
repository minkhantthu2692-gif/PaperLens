import { CheckCircle2, Languages, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/app/theme/useTheme';
import { isThemePreference, THEME_PREFERENCES, type ThemePreference } from '@/app/theme/theme';
import { Logo } from '@/components/ui/Logo';
import { isSupportedLanguage, type SupportedLanguage } from '@/i18n';
import styles from './App.module.css';

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const THEME_LABEL_KEYS = {
  light: 'theme.light',
  dark: 'theme.dark',
  system: 'theme.system',
} as const satisfies Record<ThemePreference, string>;

const CHECKPOINTS = [
  'phase0.items.tooling',
  'phase0.items.design',
  'phase0.items.localization',
] as const;

export default function App() {
  const { t, i18n } = useTranslation();
  const { preference, setPreference } = useTheme();

  const language: SupportedLanguage = isSupportedLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : 'en';
  const ThemeIcon = THEME_ICONS[preference];

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <Logo size={30} label={t('app.name')} />

        <div className={styles.preferences}>
          <div className={styles.control}>
            <Languages size={16} aria-hidden="true" />
            <label className={styles.controlLabel} htmlFor="language-select">
              {t('language.label')}
            </label>
            <select
              id="language-select"
              className={styles.select}
              value={language}
              onChange={(event) => {
                void i18n.changeLanguage(event.target.value);
              }}
            >
              <option value="en">{t('language.en')}</option>
              <option value="my">{t('language.my')}</option>
            </select>
          </div>

          <div className={styles.control}>
            <ThemeIcon size={16} aria-hidden="true" />
            <label className={styles.controlLabel} htmlFor="theme-select">
              {t('theme.label')}
            </label>
            <select
              id="theme-select"
              className={styles.select}
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
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="foundation-title">
          <span className={styles.badge}>{t('phase0.badge')}</span>
          <h1 id="foundation-title" className={styles.title}>
            {t('phase0.title')}
          </h1>
          <p className={styles.lead}>{t('phase0.description')}</p>

          <ul className={styles.checklist}>
            {CHECKPOINTS.map((key) => (
              <li key={key}>
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>

          <p className={styles.next}>{t('phase0.next')}</p>
        </section>

        <aside className={styles.aside} aria-labelledby="privacy-title">
          <span className={styles.asideIcon}>
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <h2 id="privacy-title">{t('privacy.title')}</h2>
          <p>{t('privacy.description')}</p>
          <p className={styles.notice}>{t('footer.storageNotice')}</p>
        </aside>
      </main>

      <footer className={styles.statusbar}>
        <span className={styles.status}>
          <span className={styles.dot} aria-hidden="true" />
          {t('status.ready')}
        </span>
        <span>{t('footer.version', { version: __APP_VERSION__ })}</span>
      </footer>
    </div>
  );
}
