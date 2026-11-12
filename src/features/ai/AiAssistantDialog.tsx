import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  CornerDownRight,
  Copy,
  RotateCcw,
  Sparkles,
  Square,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import formStyles from '@/components/ui/Form.module.css';
import { AiError, requestAi, type AiErrorCode } from '@/services/ai/client';
import { saveAiHistory } from '@/services/ai/history';
import { getActiveApiKey } from '@/services/ai/keys';
import { loadAiSettings } from '@/services/ai/settings';
import type {
  AiAssistantPreferences,
  AiSettings,
  AiTaskId,
  AiTaskOptions,
} from '@/services/ai/types';
import { getAiAllowance, getAiUsageSummary, type AiUsageWarning } from '@/services/ai/usage';
import {
  AI_ACTIONS,
  AI_ACTION_CATEGORIES,
  AI_CATEGORY_LABEL_KEYS,
  getAiAction,
  resolveFavoriteActions,
  type AiActionCategory,
} from './actionCatalog';
import styles from './AiAssistantDialog.module.css';

type Status = 'idle' | 'running' | 'done' | 'cancelled';

type ErrorState = AiErrorCode | 'not-configured' | 'custom-instruction';

export type AiApplyMode = 'insert' | 'append';

interface AiAssistantDialogProps {
  open: boolean;
  /** Text loaded into the editable input when the dialog opens. */
  initialText: string;
  onClose: () => void;
  onApply: (text: string, mode: AiApplyMode) => void;
  onUndo: () => void;
  onOpenSettings: () => void;
}

function errorMessageKey(code: ErrorState) {
  switch (code) {
    case 'not-configured':
      return 'assistant.notConfigured';
    case 'custom-instruction':
      return 'assistant.customInstructionRequired';
    case 'input-too-large':
      return 'assistant.inputTooLarge';
    case 'daily-limit':
      return 'assistant.dailyLimit';
    case 'monthly-limit':
      return 'assistant.monthlyLimit';
    case 'offline':
      return 'assistant.errorOffline';
    case 'missing-key':
    case 'missing-model':
    case 'missing-base-url':
      return 'assistant.notConfigured';
    case 'auth':
      return 'assistant.errorAuth';
    case 'quota':
      return 'assistant.errorQuota';
    case 'rate-limit':
      return 'assistant.errorRateLimit';
    case 'network':
      return 'assistant.errorNetwork';
    case 'timeout':
      return 'assistant.errorTimeout';
    case 'server':
      return 'assistant.errorServer';
    case 'busy':
      return 'assistant.errorBusy';
    case 'cancelled':
      return 'assistant.errorCancelled';
    case 'empty-input':
      return 'assistant.errorEmpty';
    case 'bad-request':
      return 'assistant.errorBadRequest';
    case 'invalid-response':
      return 'assistant.errorInvalid';
    default:
      return 'assistant.errorGeneric';
  }
}

function clonePreferences(preferences: AiAssistantPreferences): AiAssistantPreferences {
  return {
    ...preferences,
    favoriteActions: [...preferences.favoriteActions],
    presets: preferences.presets.map((preset) => ({ ...preset })),
  };
}

export function AiAssistantDialog({
  open,
  initialText,
  onClose,
  onApply,
  onUndo,
  onOpenSettings,
}: AiAssistantDialogProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [apiKey, setApiKey] = useState('');
  const [preferences, setPreferences] = useState<AiAssistantPreferences>(() =>
    clonePreferences(loadAiSettings().assistant),
  );
  const [inputText, setInputText] = useState(initialText);
  const [actionId, setActionId] = useState('proofread');
  const [category, setCategory] = useState<AiActionCategory>('improve');
  const [customInstruction, setCustomInstruction] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<ErrorState | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [warning, setWarning] = useState<AiUsageWarning | null>(null);
  const [warningConfirmed, setWarningConfirmed] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'done' | 'error'>('idle');
  const [applied, setApplied] = useState<AiApplyMode | null>(null);
  const [usage, setUsage] = useState(getAiUsageSummary);
  const controllerRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      controllerRef.current?.abort();
      return;
    }
    const loadedSettings = loadAiSettings();
    const loadedPreferences = clonePreferences(loadedSettings.assistant);
    const initialAction =
      resolveFavoriteActions(loadedPreferences.favoriteActions)[0] ?? getAiAction('proofread');
    setSettings(loadedSettings);
    setApiKey(getActiveApiKey(loadedSettings.providerId)?.key ?? '');
    setPreferences(loadedPreferences);
    setInputText(initialText);
    setActionId(initialAction?.id ?? 'proofread');
    setCategory(initialAction?.category ?? 'improve');
    setCustomInstruction('');
    setActivePresetId(null);
    setStatus('idle');
    setError(null);
    setResult(null);
    setCached(false);
    setWarning(null);
    setWarningConfirmed(false);
    setCopied('idle');
    setApplied(null);
    setUsage(getAiUsageSummary());
  }, [open, initialText]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const configured =
    !!apiKey.trim() &&
    !!settings.model.trim() &&
    !(settings.providerId === 'custom' && !settings.customBaseUrl.trim());

  const maxInputChars = settings.guardrails.maxInputChars;
  const overLimitBy = Math.max(0, inputText.length - maxInputChars);
  const inputEmpty = inputText.trim().length === 0;
  const action = getAiAction(actionId) ?? getAiAction('proofread');
  const task: AiTaskId = action?.task ?? 'proofread';
  const favorites = resolveFavoriteActions(preferences.favoriteActions);
  const categoryActions = AI_ACTIONS.filter((entry) => entry.category === category);

  const resetResult = () => {
    setResult(null);
    setStatus('idle');
    setError(null);
    setCached(false);
    setWarning(null);
    setWarningConfirmed(false);
    setCopied('idle');
    setApplied(null);
  };

  const selectAction = (nextId: string) => {
    const nextAction = getAiAction(nextId);
    if (!nextAction) {
      return;
    }
    setActionId(nextId);
    setCategory(nextAction.category);
    if (nextId !== 'custom') {
      setActivePresetId(null);
    }
    resetResult();
  };

  const updatePreference = <Key extends keyof AiAssistantPreferences>(
    key: Key,
    value: AiAssistantPreferences[Key],
  ) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    resetResult();
  };

  const applyPreset = (presetId: string) => {
    const preset = preferences.presets.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }
    setActionId('custom');
    setCategory('custom');
    setActivePresetId(preset.id);
    setCustomInstruction(preset.instruction);
    resetResult();
  };

  const handleClose = () => {
    controllerRef.current?.abort();
    onClose();
  };

  const handleCancel = () => {
    controllerRef.current?.abort();
  };

  const clearInput = () => {
    setInputText('');
    resetResult();
    inputRef.current?.focus();
  };

  const buildOptions = (): AiTaskOptions => ({
    tone: preferences.tone,
    outputLength: preferences.outputLength,
    preserveFormatting: preferences.preserveFormatting,
    contextAwareness: preferences.contextAwareness,
    ...(task === 'custom' ? { customInstruction: customInstruction.trim() } : {}),
  });

  const runRequest = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('running');
    setError(null);
    setResult(null);
    setCached(false);
    setWarning(null);
    setCopied('idle');
    setApplied(null);

    try {
      const response = await requestAi({
        settings,
        apiKey: apiKey.trim(),
        task,
        text: inputText,
        options: buildOptions(),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setResult(response.text);
      setCached(response.cached);
      setStatus('done');
      setUsage(getAiUsageSummary());

      if (settings.assistant.historyEnabled) {
        void saveAiHistory({
          actionId,
          task,
          providerId: settings.providerId,
          model: settings.model,
          sourceText: inputText,
          resultText: response.text,
        }).catch(() => undefined);
      }
    } catch (requestError) {
      if (requestError instanceof AiError && requestError.code === 'cancelled') {
        setStatus('cancelled');
        return;
      }
      setStatus('idle');
      setError(requestError instanceof AiError ? requestError.code : 'unknown');
    } finally {
      controllerRef.current = null;
    }
  };

  const handleGenerate = () => {
    if (status === 'running') {
      return;
    }
    if (!configured) {
      setError('not-configured');
      return;
    }
    if (inputEmpty) {
      setError('empty-input');
      return;
    }
    if (overLimitBy > 0) {
      setError('input-too-large');
      return;
    }
    if (task === 'custom' && !customInstruction.trim()) {
      setError('custom-instruction');
      return;
    }
    const allowance = getAiAllowance(settings.guardrails);
    if (allowance.blocked && !settings.cache.enabled) {
      setError(allowance.blocked);
      return;
    }
    if (allowance.warning && !allowance.blocked && !warningConfirmed) {
      setWarning(allowance.warning);
      setWarningConfirmed(true);
      return;
    }
    void runRequest();
  };

  const handleRetry = () => {
    resetResult();
    handleGenerate();
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('done');
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied('idle'), 2200);
    } catch {
      setCopied('error');
    }
  };

  const handleApply = (mode: AiApplyMode) => {
    if (!result) {
      return;
    }
    onApply(result, mode);
    setApplied(mode);
  };

  const handleUndo = () => {
    onUndo();
    setApplied(null);
  };

  const errorKey = error ? errorMessageKey(error) : null;
  const generateDisabled = status === 'running' || inputEmpty || overLimitBy > 0;

  const footer = (
    <div className={styles.footer}>
      {status === 'running' ? (
        <Button variant="secondary" onClick={handleCancel}>
          <Square size={15} aria-hidden="true" />
          {t('assistant.cancelRequest')}
        </Button>
      ) : result ? (
        <>
          <Button variant="ghost" onClick={() => void handleCopy(result)}>
            {copied === 'done' ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            {copied === 'done' ? t('assistant.copied') : t('assistant.copy')}
          </Button>
          <Button variant="ghost" onClick={handleRetry}>
            <RotateCcw size={15} aria-hidden="true" />
            {t('assistant.retry')}
          </Button>
        </>
      ) : null}

      {!configured && status !== 'running' ? (
        <Button variant="primary" onClick={onOpenSettings}>
          {t('assistant.openSettings')}
        </Button>
      ) : applied ? (
        <Button variant="secondary" onClick={handleUndo}>
          <Undo2 size={15} aria-hidden="true" />
          {t('assistant.undoApply')}
        </Button>
      ) : result ? (
        <>
          <Button variant="secondary" onClick={() => handleApply('insert')}>
            <CornerDownRight size={15} aria-hidden="true" />
            {t('assistant.insertIntoEditor')}
          </Button>
          <Button variant="primary" onClick={() => handleApply('append')}>
            <ArrowDownToLine size={15} aria-hidden="true" />
            {t('assistant.appendBelow')}
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={handleGenerate} disabled={generateDisabled}>
          <Sparkles size={15} aria-hidden="true" />
          {status === 'running'
            ? t('assistant.generating')
            : warning
              ? t('assistant.sendAnyway')
              : t('assistant.generate')}
        </Button>
      )}

      <Button variant={applied ? 'primary' : 'ghost'} onClick={handleClose}>
        {t('common.close')}
      </Button>
    </div>
  );

  return (
    <Dialog
      open={open}
      title={t('assistant.title')}
      description={t('assistant.description')}
      onClose={handleClose}
      className={styles.dialog}
      footer={footer}
    >
      <div className={styles.body}>
        <div className={styles.inputBlock}>
          <div className={styles.inputHeader}>
            <label className={styles.label} htmlFor="ai-input">
              {t('assistant.inputLabel')}
            </label>
            <div className={styles.inputMeta}>
              <span
                className={overLimitBy > 0 ? styles.overLimit : styles.counter}
                role="status"
                aria-live="polite"
              >
                {t('assistant.characterCount', {
                  count: inputText.length,
                  max: maxInputChars,
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={clearInput}
                disabled={inputEmpty || status === 'running'}
                aria-label={t('assistant.clearInput')}
                title={t('assistant.clearInput')}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
          <textarea
            ref={inputRef}
            id="ai-input"
            className={styles.textarea}
            rows={8}
            value={inputText}
            disabled={status === 'running'}
            placeholder={t('assistant.inputPlaceholder')}
            aria-describedby="ai-input-help"
            aria-invalid={overLimitBy > 0}
            onChange={(event) => {
              setInputText(event.target.value);
              resetResult();
            }}
          />
          <p
            id="ai-input-help"
            className={overLimitBy > 0 ? styles.errorHint : styles.hint}
            role={overLimitBy > 0 ? 'alert' : undefined}
          >
            {overLimitBy > 0
              ? t('assistant.inputOverLimit', { count: overLimitBy })
              : t('assistant.inputHint')}
          </p>
          <p className={styles.hint}>
            {t('assistant.usageInfo', {
              today: usage.todayRequests,
              month: usage.monthRequests,
            })}
          </p>
        </div>

        {favorites.length > 0 ? (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>{t('assistant.favorites')}</span>
            <div className={styles.chips}>
              {favorites.map((favorite) => {
                const Icon = favorite.icon;
                return (
                  <button
                    key={favorite.id}
                    type="button"
                    className={`${styles.chip} ${actionId === favorite.id ? styles.chipActive : ''}`}
                    aria-pressed={actionId === favorite.id}
                    disabled={status === 'running'}
                    onClick={() => selectAction(favorite.id)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {t(favorite.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className={styles.categories} role="tablist" aria-label={t('assistant.categories')}>
          {AI_ACTION_CATEGORIES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={category === id}
              className={category === id ? styles.activeTab : styles.tab}
              disabled={status === 'running'}
              onClick={() => setCategory(id)}
            >
              {t(AI_CATEGORY_LABEL_KEYS[id])}
            </button>
          ))}
        </div>

        <div
          className={styles.section}
          role="tabpanel"
          aria-label={t(AI_CATEGORY_LABEL_KEYS[category])}
        >
          <span className={styles.sectionTitle}>{t('assistant.actionPick')}</span>
          <div className={styles.actions}>
            {categoryActions.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`${styles.action} ${actionId === entry.id ? styles.actionActive : ''}`}
                  aria-pressed={actionId === entry.id}
                  disabled={status === 'running'}
                  onClick={() => selectAction(entry.id)}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{t(entry.labelKey)}</span>
                </button>
              );
            })}
          </div>

          {category === 'custom' ? (
            <>
              <div className={styles.subsection}>
                <span className={styles.label}>{t('assistant.presets')}</span>
                {preferences.presets.length === 0 ? (
                  <p className={styles.hint}>{t('assistant.noPresets')}</p>
                ) : (
                  <div className={styles.chips}>
                    {preferences.presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`${styles.chip} ${activePresetId === preset.id ? styles.chipActive : ''}`}
                        aria-pressed={activePresetId === preset.id}
                        disabled={status === 'running'}
                        onClick={() => applyPreset(preset.id)}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.subsection}>
                <label className={styles.label} htmlFor="ai-custom-instruction">
                  {t('assistant.customInstruction')}
                </label>
                <textarea
                  id="ai-custom-instruction"
                  className={styles.customTextarea}
                  rows={3}
                  value={customInstruction}
                  disabled={status === 'running'}
                  placeholder={t('assistant.customInstructionPlaceholder')}
                  onChange={(event) => {
                    setCustomInstruction(event.target.value);
                    setActivePresetId(null);
                    if (actionId !== 'custom') {
                      setActionId('custom');
                    }
                    resetResult();
                  }}
                />
              </div>
            </>
          ) : null}
        </div>

        <details className={styles.advanced}>
          <summary className={styles.summary}>{t('assistant.advanced')}</summary>
          <p className={styles.hint}>{t('assistant.advancedHint')}</p>
          <div className={styles.advancedGrid}>
            <label className={styles.field} htmlFor="ai-tone">
              <span className={styles.label}>{t('assistant.tone')}</span>
              <select
                id="ai-tone"
                className={formStyles.select}
                value={preferences.tone}
                disabled={status === 'running'}
                onChange={(event) =>
                  updatePreference('tone', event.target.value as AiAssistantPreferences['tone'])
                }
              >
                <option value="academic">{t('assistant.toneAcademic')}</option>
                <option value="professional">{t('assistant.toneProfessional')}</option>
                <option value="casual">{t('assistant.toneCasual')}</option>
              </select>
            </label>
            <label className={styles.field} htmlFor="ai-output-length">
              <span className={styles.label}>{t('assistant.outputLength')}</span>
              <select
                id="ai-output-length"
                className={formStyles.select}
                value={preferences.outputLength}
                disabled={status === 'running'}
                onChange={(event) =>
                  updatePreference(
                    'outputLength',
                    event.target.value as AiAssistantPreferences['outputLength'],
                  )
                }
              >
                <option value="short">{t('assistant.lengthShort')}</option>
                <option value="balanced">{t('assistant.lengthBalanced')}</option>
                <option value="detailed">{t('assistant.lengthDetailed')}</option>
              </select>
            </label>
          </div>
          <div className={styles.toggles}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={preferences.preserveFormatting}
                disabled={status === 'running'}
                onChange={(event) => updatePreference('preserveFormatting', event.target.checked)}
              />
              <span>
                <span className={styles.toggleLabel}>{t('assistant.preserveFormatting')}</span>
                <span className={styles.hint}>{t('assistant.preserveFormattingHint')}</span>
              </span>
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={preferences.contextAwareness}
                disabled={status === 'running'}
                onChange={(event) => updatePreference('contextAwareness', event.target.checked)}
              />
              <span>
                <span className={styles.toggleLabel}>{t('assistant.contextAwareness')}</span>
                <span className={styles.hint}>{t('assistant.contextAwarenessHint')}</span>
              </span>
            </label>
          </div>
        </details>

        {!configured ? (
          <div className={formStyles.alert} role="status">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{t('assistant.notConfigured')}</span>
          </div>
        ) : null}

        {errorKey ? (
          <div className={formStyles.alert} role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{t(errorKey)}</span>
          </div>
        ) : null}

        {status === 'cancelled' ? (
          <p className={styles.cancelled} role="status">
            {t('assistant.cancelled')}
          </p>
        ) : null}

        {warning ? (
          <div className={formStyles.alert} role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>
              {warning === 'daily' ? t('assistant.warningDaily') : t('assistant.warningMonthly')}
            </span>
          </div>
        ) : null}

        {status === 'running' ? (
          <p className={styles.running} role="status">
            <Wand2 size={16} aria-hidden="true" />
            {t('assistant.generating')}
          </p>
        ) : null}

        {result ? (
          <section className={styles.result} aria-label={t('assistant.comparison')}>
            <div className={styles.resultHeader}>
              <span className={styles.resultTitle}>{t('assistant.result')}</span>
              <span className={styles.resultMeta}>
                {cached ? `${t('assistant.fromCache')} · ` : ''}
                {t('assistant.resultMeta', { count: result.length })}
              </span>
            </div>
            <div className={styles.comparison}>
              <div className={styles.comparePane}>
                <span className={styles.compareLabel}>{t('assistant.original')}</span>
                <pre className={styles.compareText}>{inputText}</pre>
              </div>
              <div className={`${styles.comparePane} ${styles.comparePaneResult}`}>
                <span className={styles.compareLabel}>{t('assistant.generated')}</span>
                <pre className={styles.compareText}>{result}</pre>
              </div>
            </div>
            {applied ? (
              <p className={styles.applied} role="status">
                <Check size={15} aria-hidden="true" />
                {applied === 'append'
                  ? t('assistant.appliedAppend')
                  : t('assistant.appliedInsert')}{' '}
                {t('assistant.appliedUndoHint')}
              </p>
            ) : (
              <p className={styles.hint}>{t('assistant.applyHint')}</p>
            )}
            {copied === 'error' ? <p className={styles.hint}>{t('assistant.copyFailed')}</p> : null}
          </section>
        ) : null}

        <p className={styles.privacy}>{t('assistant.privacy')}</p>
      </div>
    </Dialog>
  );
}
