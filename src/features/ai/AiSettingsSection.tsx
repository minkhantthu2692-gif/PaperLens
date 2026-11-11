import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff, KeyRound, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import formStyles from '@/components/ui/Form.module.css';
import { clearAiCache, getAiCacheCount } from '@/services/ai/cache';
import {
  addApiKey,
  clearApiKeys,
  getActiveApiKey,
  listApiKeys,
  removeApiKey,
  setActiveApiKey,
  syncApiKeyStorage,
  type AiApiKeyEntry,
} from '@/services/ai/keys';
import { AI_PROVIDERS, fetchProviderModels, getProviderDefinition } from '@/services/ai/providers';
import { loadAiSettings, saveAiSettings } from '@/services/ai/settings';
import type { AiCacheSettings, AiGuardrails, AiProviderId, AiSettings } from '@/services/ai/types';
import { getAiUsageSummary, resetAiUsage } from '@/services/ai/usage';
import styles from './AiSettingsSection.module.css';

type Feedback = { type: 'success' | 'error'; text: string } | null;
type ModelsState = 'idle' | 'loading' | 'error';

const NUMERIC_FIELDS = [
  { key: 'maxInputChars', min: 500, max: 50000, label: 'settings.aiMaxInput' },
  { key: 'maxOutputTokens', min: 64, max: 8192, label: 'settings.aiMaxOutput' },
  { key: 'timeoutMs', min: 5000, max: 120000, label: 'settings.aiTimeout' },
  { key: 'maxRetries', min: 0, max: 4, label: 'settings.aiRetries' },
  { key: 'maxConcurrent', min: 1, max: 4, label: 'settings.aiConcurrency' },
  { key: 'dailyRequestLimit', min: 0, max: 10000, label: 'settings.aiDailyLimit' },
  { key: 'monthlyRequestLimit', min: 0, max: 100000, label: 'settings.aiMonthlyLimit' },
  { key: 'warningThreshold', min: 1, max: 100, label: 'settings.aiWarningThreshold' },
] as const satisfies ReadonlyArray<{
  key: keyof AiGuardrails;
  min: number;
  max: number;
  label: string;
}>;

function maskKey(key: string): string {
  if (key.length <= 4) {
    return '••••';
  }
  return `••••${key.slice(-4)}`;
}

export function AiSettingsSection() {
  const { t } = useTranslation();
  const modelsListId = useId();
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [keys, setKeys] = useState<AiApiKeyEntry[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsState, setModelsState] = useState<ModelsState>('idle');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [usage, setUsage] = useState(getAiUsageSummary);
  const [cacheCount, setCacheCount] = useState(0);

  const provider = getProviderDefinition(settings.providerId);
  const activeKey = keys.find((entry) => entry.id === activeKeyId) ?? keys[0] ?? null;

  useEffect(() => {
    setKeys(listApiKeys(settings.providerId));
    setActiveKeyId(getActiveApiKey(settings.providerId)?.id ?? null);
    setKeyLabel('');
    setKeyDraft('');
    setShowKey(false);
  }, [settings.providerId]);

  useEffect(() => {
    let active = true;
    getAiCacheCount()
      .then((count) => {
        if (active) {
          setCacheCount(count);
        }
      })
      .catch(() => {
        // The cache may be unavailable in private browsing modes.
      });
    return () => {
      active = false;
    };
  }, []);

  const updateGuardrail = (key: keyof AiGuardrails, value: number) => {
    setSettings((current) => ({
      ...current,
      guardrails: { ...current.guardrails, [key]: value },
    }));
  };

  const updateCache = (key: keyof AiCacheSettings, value: boolean | number) => {
    setSettings((current) => ({
      ...current,
      cache: { ...current.cache, [key]: value },
    }));
  };

  const handleSave = () => {
    if (provider.requiresBaseUrl && !settings.customBaseUrl.trim()) {
      setFeedback({ type: 'error', text: t('settings.aiBaseUrlRequired') });
      return;
    }
    saveAiSettings(settings);
    setKeys(listApiKeys(settings.providerId));
    setActiveKeyId(getActiveApiKey(settings.providerId)?.id ?? null);
    setFeedback({ type: 'success', text: t('settings.aiSaved') });
  };

  const handleRefreshModels = async () => {
    if (!activeKey) {
      setFeedback({ type: 'error', text: t('settings.aiKeyRequired') });
      return;
    }
    setModelsState('loading');
    setFeedback(null);
    try {
      const list = await fetchProviderModels(
        settings.providerId,
        activeKey.key,
        settings.customBaseUrl,
      );
      setModels(list);
      setModelsState('idle');
      if (list.length > 0) {
        setSettings((current) => ({
          ...current,
          model: current.model.trim() ? current.model : (list[0] ?? ''),
        }));
      }
      setFeedback({ type: 'success', text: t('settings.aiModelsLoaded', { count: list.length }) });
    } catch {
      setModelsState('error');
      setFeedback({ type: 'error', text: t('settings.aiModelsError') });
    }
  };

  const handleAddKey = () => {
    if (!keyDraft.trim()) {
      setFeedback({ type: 'error', text: t('settings.aiKeyEmpty') });
      return;
    }
    const entry = addApiKey(
      { providerId: settings.providerId, label: keyLabel, key: keyDraft },
      settings.rememberKey,
    );
    if (!entry) {
      setFeedback({ type: 'error', text: t('settings.aiKeyEmpty') });
      return;
    }
    setKeys(listApiKeys(settings.providerId));
    setActiveKeyId(getActiveApiKey(settings.providerId)?.id ?? entry.id);
    setKeyLabel('');
    setKeyDraft('');
    setShowKey(false);
    setFeedback({ type: 'success', text: t('settings.aiKeyAdded') });
  };

  const handleSelectKey = (id: string) => {
    setActiveApiKey(settings.providerId, id, settings.rememberKey);
    setActiveKeyId(id);
    setFeedback({ type: 'success', text: t('settings.aiKeyActivated') });
  };

  const handleRemoveKey = (id: string) => {
    removeApiKey(id, settings.rememberKey);
    setKeys(listApiKeys(settings.providerId));
    setActiveKeyId(getActiveApiKey(settings.providerId)?.id ?? null);
    setFeedback({ type: 'success', text: t('settings.aiKeyRemoved') });
  };

  const handleClearKeys = () => {
    clearApiKeys(settings.providerId, settings.rememberKey);
    setKeys([]);
    setActiveKeyId(null);
    setFeedback({ type: 'success', text: t('settings.aiKeysCleared') });
  };

  const handleRememberChange = (remember: boolean) => {
    setSettings((current) => ({ ...current, rememberKey: remember }));
    syncApiKeyStorage(remember);
  };

  const handleResetUsage = () => {
    resetAiUsage();
    setUsage(getAiUsageSummary());
    setFeedback({ type: 'success', text: t('settings.aiUsageReset') });
  };

  const handleClearCache = async () => {
    try {
      await clearAiCache();
      setCacheCount(0);
      setFeedback({ type: 'success', text: t('settings.aiCacheCleared') });
    } catch {
      setFeedback({ type: 'error', text: t('settings.aiCacheClearError') });
    }
  };

  return (
    <section className={styles.card} aria-labelledby="settings-ai">
      <h2 id="settings-ai">{t('settings.aiAssistance')}</h2>
      <p className={styles.cardDescription}>{t('settings.aiDescription')}</p>

      {feedback ? (
        <div
          className={feedback.type === 'success' ? formStyles.success : formStyles.alert}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ai-provider">
            {t('settings.aiProvider')}
          </label>
          <select
            id="ai-provider"
            className={formStyles.select}
            value={settings.providerId}
            onChange={(event) => {
              const providerId = event.target.value as AiProviderId;
              setSettings((current) => ({ ...current, providerId }));
              setModels([]);
              setModelsState('idle');
            }}
          >
            {AI_PROVIDERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.id === 'custom' ? t('settings.aiProviderCustom') : option.label}
              </option>
            ))}
          </select>
        </div>

        {provider.requiresBaseUrl ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ai-base-url">
              {t('settings.aiBaseUrl')}
            </label>
            <input
              id="ai-base-url"
              className={formStyles.input}
              value={settings.customBaseUrl}
              placeholder="https://example.com/v1"
              onChange={(event) => {
                const customBaseUrl = event.target.value;
                setSettings((current) => ({ ...current, customBaseUrl }));
              }}
            />
            <p className={styles.hint}>{t('settings.aiBaseUrlHint')}</p>
          </div>
        ) : null}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="ai-model">
            {t('settings.aiModel')}
          </label>
          <div className={styles.inline}>
            <input
              id="ai-model"
              className={formStyles.input}
              value={settings.model}
              list={modelsListId}
              placeholder={t('settings.aiModelPlaceholder')}
              onChange={(event) => {
                const model = event.target.value;
                setSettings((current) => ({ ...current, model }));
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRefreshModels()}
              disabled={modelsState === 'loading'}
            >
              <RefreshCw
                size={15}
                aria-hidden="true"
                className={modelsState === 'loading' ? styles.spinning : undefined}
              />
              {t('settings.aiRefreshModels')}
            </Button>
          </div>
          <datalist id={modelsListId}>
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <p className={styles.hint}>
            {modelsState === 'error' ? t('settings.aiModelsError') : t('settings.aiModelHint')}
          </p>
        </div>
      </div>

      <div className={styles.field} role="group" aria-labelledby="ai-keys-label">
        <span className={styles.label} id="ai-keys-label">
          {t('settings.aiKeys')}
        </span>
        <p className={styles.hint}>{t('settings.aiKeysHint')}</p>

        {keys.length === 0 ? (
          <p className={styles.hint}>{t('settings.aiNoKeys')}</p>
        ) : (
          <ul className={styles.keyList}>
            {keys.map((entry) => (
              <li key={entry.id} className={styles.keyRow}>
                <label className={styles.keyChoice}>
                  <input
                    type="radio"
                    name="ai-active-key"
                    checked={entry.id === activeKeyId}
                    onChange={() => handleSelectKey(entry.id)}
                  />
                  <span className={styles.keyInfo}>
                    <span className={styles.keyLabel}>{entry.label}</span>
                    <span className={styles.keyValue}>{maskKey(entry.key)}</span>
                  </span>
                </label>
                {entry.id === activeKeyId ? (
                  <span className={styles.keyBadge}>{t('settings.aiKeyActive')}</span>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={() => handleRemoveKey(entry.id)}
                  aria-label={t('settings.aiRemoveKey', { label: entry.label })}
                  title={t('settings.aiRemoveKey', { label: entry.label })}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ai-key-label">
              {t('settings.aiKeyLabel')}
            </label>
            <input
              id="ai-key-label"
              className={formStyles.input}
              value={keyLabel}
              placeholder={t('settings.aiKeyLabelPlaceholder')}
              onChange={(event) => setKeyLabel(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ai-api-key">
              {t('settings.aiApiKey')}
            </label>
            <div className={styles.inline}>
              <input
                id="ai-api-key"
                className={formStyles.input}
                type={showKey ? 'text' : 'password'}
                value={keyDraft}
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-…"
                onChange={(event) => setKeyDraft(event.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={() => setShowKey((current) => !current)}
                aria-label={showKey ? t('settings.aiHideKey') : t('settings.aiShowKey')}
                title={showKey ? t('settings.aiHideKey') : t('settings.aiShowKey')}
              >
                {showKey ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={handleAddKey}>
            <Plus size={15} aria-hidden="true" />
            {t('settings.aiAddKey')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClearKeys} disabled={keys.length === 0}>
            <Trash2 size={15} aria-hidden="true" />
            {t('settings.aiClearKeys')}
          </Button>
        </div>
        <p className={styles.hint}>{t('settings.aiApiKeyHint')}</p>
      </div>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={settings.rememberKey}
          onChange={(event) => handleRememberChange(event.target.checked)}
        />
        <span className={styles.checkboxText}>
          <span className={styles.checkboxLabel}>{t('settings.aiRememberKey')}</span>
          <span className={styles.hint}>{t('settings.aiRememberKeyHint')}</span>
        </span>
      </label>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={settings.cache.enabled}
          onChange={(event) => updateCache('enabled', event.target.checked)}
        />
        <span className={styles.checkboxText}>
          <span className={styles.checkboxLabel}>{t('settings.aiCache')}</span>
          <span className={styles.hint}>{t('settings.aiCacheHint')}</span>
        </span>
      </label>

      {settings.cache.enabled ? (
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ai-cache-expiry">
              {t('settings.aiCacheExpiry')}
            </label>
            <input
              id="ai-cache-expiry"
              className={formStyles.input}
              type="number"
              min={1}
              max={90}
              value={settings.cache.expiryDays}
              onChange={(event) => {
                const number = Number(event.target.value);
                if (Number.isFinite(number)) {
                  updateCache('expiryDays', number);
                }
              }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ai-cache-max">
              {t('settings.aiCacheMaxEntries')}
            </label>
            <input
              id="ai-cache-max"
              className={formStyles.input}
              type="number"
              min={1}
              max={500}
              value={settings.cache.maxEntries}
              onChange={(event) => {
                const number = Number(event.target.value);
                if (Number.isFinite(number)) {
                  updateCache('maxEntries', number);
                }
              }}
            />
          </div>
        </div>
      ) : null}

      <div className={styles.usageRow}>
        <span className={styles.usage}>{t('settings.aiCacheCount', { count: cacheCount })}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleClearCache()}
          disabled={cacheCount === 0}
        >
          <Trash2 size={15} aria-hidden="true" />
          {t('settings.aiCacheClear')}
        </Button>
      </div>

      <details className={styles.advanced}>
        <summary className={styles.summary}>{t('settings.aiAdvanced')}</summary>
        <p className={styles.hint}>{t('settings.aiAdvancedHint')}</p>
        <div className={styles.grid}>
          {NUMERIC_FIELDS.map((field) => (
            <div key={field.key} className={styles.field}>
              <label className={styles.label} htmlFor={`ai-${field.key}`}>
                {t(field.label)}
              </label>
              <input
                id={`ai-${field.key}`}
                className={formStyles.input}
                type="number"
                min={field.min}
                max={field.max}
                value={settings.guardrails[field.key]}
                onChange={(event) => {
                  const number = Number(event.target.value);
                  if (Number.isFinite(number)) {
                    updateGuardrail(field.key, number);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </details>

      <div className={styles.usageRow}>
        <span className={styles.usage}>
          {t('settings.aiUsageValue', {
            today: usage.todayRequests,
            month: usage.monthRequests,
            tokens: usage.monthTokens,
          })}
        </span>
        <Button variant="ghost" size="sm" onClick={handleResetUsage}>
          {t('settings.aiResetUsage')}
        </Button>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" onClick={handleSave}>
          <Save size={16} aria-hidden="true" />
          {t('settings.aiSave')}
        </Button>
      </div>

      <p className={styles.privacy}>
        <KeyRound size={15} aria-hidden="true" />
        {t('settings.aiPrivacy')}
      </p>
    </section>
  );
}
