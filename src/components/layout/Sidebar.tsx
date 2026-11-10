import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, FolderOpen, Settings } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/ui/Logo';
import styles from './Sidebar.module.css';

const SIDEBAR_STORAGE_KEY = 'paperlens.sidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'expanded';
  } catch {
    return true;
  }
}

export function Sidebar() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch {
      // Preference still applies for this session.
    }
  }, [collapsed]);

  const items = [
    { to: '/', label: t('nav.documents'), icon: FolderOpen, end: true },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  const handleNavigate = () => {
    if (window.matchMedia('(max-width: 48rem)').matches) {
      setCollapsed(true);
    }
  };

  return (
    <>
      <aside
        className={clsx(styles.sidebar, collapsed ? styles.collapsed : styles.expanded)}
        aria-label={t('nav.documents')}
      >
        <div className={styles.brand}>
          <Logo size={30} {...(!collapsed ? { label: t('app.name') } : {})} />
        </div>

        <nav className={styles.nav}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={handleNavigate}
                className={({ isActive }) => clsx(styles.link, isActive && styles.linkActive)}
                title={item.label}
                aria-label={item.label}
              >
                <Icon size={20} aria-hidden="true" />
                <span className={styles.label}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <button
          type="button"
          className={styles.toggle}
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <PanelLeftOpen size={19} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={19} aria-hidden="true" />
          )}
          <span className={styles.label}>{collapsed ? t('nav.expand') : t('nav.collapse')}</span>
        </button>
      </aside>
      {!collapsed ? (
        <button
          type="button"
          className={styles.scrim}
          aria-label={t('nav.collapse')}
          onClick={() => setCollapsed(true)}
        />
      ) : null}
    </>
  );
}
