import { useEffect, useState } from 'react';
import {
  BrainCircuit,
  Boxes,
  Flame,
  Network,
  Orbit,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Waves,
  X,
  Zap,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import formStyles from '@/components/ui/Form.module.css';
import {
  SearchablePicker,
  type SearchablePickerFilter,
  type SearchablePickerOption,
} from './SearchablePicker';
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

const RECENT_MODELS_STORAGE_KEY = 'paperlens.ai.recent-models';
const MAX_RECENT_MODELS = 8;

function getProviderIcon(providerId: AiProviderId) {
  const iconProps = { size: 20, strokeWidth: 2 };
  switch (providerId) {
    case 'openai':
      return <Orbit {...iconProps} color="#10a37f" />;
    case 'gemini':
      return <Sparkles {...iconProps} color="#4285f4" />;
    case 'anthropic':
      return <BrainCircuit {...iconProps} color="#d97757" />;
    case 'openrouter':
      return <Network {...iconProps} color="#8b5cf6" />;
    case 'groq':
      return <Zap {...iconProps} color="#f97316" />;
    case 'deepseek':
      return <Waves {...iconProps} color="#2563eb" />;
    case 'mistral':
      return <Flame {...iconProps} color="#f97316" />;
    case 'xai':
      return <X {...iconProps} color="#8b5cf6" />;
    case 'together':
      return <Boxes {...iconProps} color="#ec4899" />;
    case 'custom':
      return <SlidersHorizontal {...iconProps} color="#64748b" />;
  }
}

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

function loadRecentModels(providerId: AiProviderId): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_MODELS_STORAGE_KEY) ?? '{}');
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
      return [];
    }
    const values = (stored as Record<string, unknown>)[providerId];
    return Array.isArray(values)
      ? values
          .filter((value): value is string => typeof value === 'string')
          .slice(0, MAX_RECENT_MODELS)
      : [];
  } catch {
    return [];
  }
}

function storeRecentModel(providerId: AiProviderId, model: string): string[] {
  const recent = [model, ...loadRecentModels(providerId).filter((value) => value !== model)].slice(
    0,
    MAX_RECENT_MODELS,
  );
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_MODELS_STORAGE_KEY) ?? '{}');
    const records =
      typeof stored === 'object' && stored !== null && !Array.isArray(stored)
        ? (stored as Record<string, unknown>)
        : {};
    localStorage.setItem(
      RECENT_MODELS_STORAGE_KEY,
      JSON.stringify({ ...records, [providerId]: recent }),
    );
  } catch {
    // Recent selections remain available for the current page if storage is unavailable.
  }
  return recent;
}

export function AiSettingsSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [keys, setKeys] = useState<AiApiKeyEntry[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [recentModels, setRecentModels] = useState<string[]>([]);
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
    setRecentModels(loadRecentModels(settings.providerId));
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
      setFeedback({ type: 'success', text: t('settings.aiModelsLoaded', { count: list.length }) });
    } catch {
      setModelsState('error');
      setFeedback({ type: 'error', text: t('settings.aiModelsError') });
    }
  };

  const handleSelectModel = (model: string) => {
    setSettings((current) => ({ ...current, model }));
    setRecentModels(storeRecentModel(settings.providerId, model));
  };

  const providerOptions: SearchablePickerOption[] = AI_PROVIDERS.map((option) => ({
    value: option.id,
    label: option.id === 'custom' ? t('settings.aiProviderCustom') : option.label,
    icon: getProviderIcon(option.id),
  }));
  const modelOptions: SearchablePickerOption[] = [...new Set([...recentModels, ...models])].map(
    (model) => ({ value: model, label: model }),
  );
  const modelFilters: SearchablePickerFilter[] = [];
  const freeModels = modelOptions.filter((option) => /:free$/i.test(option.value));
  if (freeModels.length > 0) {
    modelFilters.push({
      value: 'free',
      label: t('settings.aiFreeModels'),
      count: freeModels.length,
      matches: (option) => /:free$/i.test(option.value),
    });
  }
  const publishers = new Map<string, number>();
  for (const option of modelOptions) {
    const separator = option.value.indexOf('/');
    if (separator > 0) {
      const publisher = option.value.slice(0, separator);
      publishers.set(publisher, (publishers.get(publisher) ?? 0) + 1);
    }
  }
  for (const [publisher, count] of publishers) {
    modelFilters.push({
      value: `publisher:${publisher}`,
      label: publisher,
      count,
      matches: (option) => option.value.startsWith(`${publisher}/`),
    });
  }
  if (recentModels.some((recent) => modelOptions.some((option) => option.value === recent))) {
    const recentSet = new Set(recentModels);
    modelFilters.unshift({
      value: 'recent',
      label: t('settings.aiRecentModels'),
      count: modelOptions.filter((option) => recentSet.has(option.value)).length,
      matches: (option) => recentSet.has(option.value),
    });
  }

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
    <section className={`${styles.card} ${styles.aiCard}`} aria-labelledby="settings-ai">
      <div className={styles.cardHeader}>
        <h2 id="settings-ai">{t('settings.aiAssistance')}</h2>
        <p className={styles.cardDescription}>{t('settings.aiDescription')}</p>
      </div>

      {feedback ? (
        <div
          className={feedback.type === 'success' ? formStyles.success : formStyles.alert}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className={styles.setupGrid}>
        <div className={`${styles.grid} ${styles.connectionGrid}`}>
          <div className={styles.field}>
            <span className={styles.label} id="ai-provider-label">
              {t('settings.aiProvider')}
            </span>
            <SearchablePicker
              label={t('settings.aiProvider')}
              value={settings.providerId}
              options={providerOptions}
              placeholder={t('settings.aiProvider')}
              searchPlaceholder={t('settings.aiSearchProviders')}
              emptyMessage={t('settings.aiNoProvidersFound')}
              onChange={(value) => {
                const providerId = value as AiProviderId;
                setSettings((current) => ({ ...current, providerId }));
                setModels([]);
                setModelsState('idle');
              }}
            />
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

          <div className={`${styles.field} ${styles.modelField} ${styles.modelWide}`}>
            <span className={styles.label} id="ai-model-label">
              {t('settings.aiModel')}
            </span>
            <div className={`${styles.inline} ${styles.modelControls}`}>
              <SearchablePicker
                label={t('settings.aiModel')}
                value={settings.model}
                options={modelOptions}
                recentValues={recentModels}
                recentLabel={t('settings.aiRecentModels')}
                allLabel={t('settings.aiAllModels')}
                allFilterLabel={t('settings.aiAllModels')}
                filters={modelFilters}
                placeholder={t('settings.aiModelPlaceholder')}
                searchPlaceholder={t('settings.aiSearchModels')}
                emptyMessage={t('settings.aiNoModelsFound')}
                allowCustomValue
                customValueLabel={(model) => t('settings.aiUseModel', { model })}
                onChange={handleSelectModel}
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
            <p className={styles.hint}>
              {modelsState === 'error'
                ? t('settings.aiModelsError')
                : t('settings.aiModelHint', { count: models.length })}
            </p>
          </div>
        </div>

        <div
          className={`${styles.field} ${styles.keySettings}`}
          role="group"
          aria-labelledby="ai-keys-label"
        >
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
                name="paperlens-api-key-label"
                autoComplete="off"
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
                  name="paperlens-provider-api-key"
                  value={keyDraft}
                  autoComplete="new-password"
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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearKeys}
              disabled={keys.length === 0}
            >
              <Trash2 size={15} aria-hidden="true" />
              {t('settings.aiClearKeys')}
            </Button>
          </div>
          <p className={styles.hint}>{t('settings.aiApiKeyHint')}</p>
        </div>
      </div>

      <div className={styles.preferences}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            role="switch"
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
            role="switch"
            checked={settings.cache.enabled}
            onChange={(event) => updateCache('enabled', event.target.checked)}
          />
          <span className={styles.checkboxText}>
            <span className={styles.checkboxLabel}>{t('settings.aiCache')}</span>
            <span className={styles.hint}>{t('settings.aiCacheHint')}</span>
          </span>
        </label>
      </div>

      {settings.cache.enabled ? (
        <div className={`${styles.grid} ${styles.cacheSettings}`}>
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
