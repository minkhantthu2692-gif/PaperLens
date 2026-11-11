import { useId, useState } from 'react';
import { Eye, EyeOff, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import formStyles from '@/components/ui/Form.module.css';
import { AI_PROVIDERS, fetchProviderModels, getProviderDefinition } from '@/services/ai/providers';
import {
  loadAiApiKey,
  loadAiSettings,
  saveAiSettings,
  clearAiApiKey,
} from '@/services/ai/settings';
import type { AiGuardrails, AiProviderId, AiSettings } from '@/services/ai/types';
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

export function AiSettingsSection() {
  const { t } = useTranslation();
  const modelsListId = useId();
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [apiKey, setApiKey] = useState(loadAiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsState, setModelsState] = useState<ModelsState>('idle');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [usage, setUsage] = useState(getAiUsageSummary);

  const provider = getProviderDefinition(settings.providerId);

  const updateGuardrail = (key: keyof AiGuardrails, value: number) => {
    setSettings((current) => ({
      ...current,
      guardrails: { ...current.guardrails, [key]: value },
    }));
  };

  const handleSave = () => {
    if (provider.requiresBaseUrl && !settings.customBaseUrl.trim()) {
      setFeedback({ type: 'error', text: t('settings.aiBaseUrlRequired') });
      return;
    }
    saveAiSettings(settings, apiKey);
    setFeedback({ type: 'success', text: t('settings.aiSaved') });
  };

  const handleRefreshModels = async () => {
    if (!apiKey.trim()) {
      setFeedback({ type: 'error', text: t('settings.aiKeyRequired') });
      return;
    }
    setModelsState('loading');
    setFeedback(null);
    try {
      const list = await fetchProviderModels(
        settings.providerId,
        apiKey.trim(),
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

  const handleClearKey = () => {
    clearAiApiKey();
    setApiKey('');
    setFeedback({ type: 'success', text: t('settings.aiKeyCleared') });
  };

  const handleResetUsage = () => {
    resetAiUsage();
    setUsage(getAiUsageSummary());
    setFeedback({ type: 'success', text: t('settings.aiUsageReset') });
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

        <div className={styles.field}>
          <label className={styles.label} htmlFor="ai-api-key">
            {t('settings.aiApiKey')}
          </label>
          <div className={styles.inline}>
            <input
              id="ai-api-key"
              className={formStyles.input}
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-…"
              onChange={(event) => setApiKey(event.target.value)}
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
          <p className={styles.hint}>{t('settings.aiApiKeyHint')}</p>
        </div>
      </div>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={settings.rememberKey}
          onChange={(event) => {
            const rememberKey = event.target.checked;
            setSettings((current) => ({ ...current, rememberKey }));
          }}
        />
        <span className={styles.checkboxText}>
          <span className={styles.checkboxLabel}>{t('settings.aiRememberKey')}</span>
          <span className={styles.hint}>{t('settings.aiRememberKeyHint')}</span>
        </span>
      </label>

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
        <Button variant="ghost" onClick={handleClearKey}>
          <Trash2 size={16} aria-hidden="true" />
          {t('settings.aiClearKey')}
        </Button>
      </div>

      <p className={styles.privacy}>
        <KeyRound size={15} aria-hidden="true" />
        {t('settings.aiPrivacy')}
      </p>
    </section>
  );
}
