import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Plus,
  Replace,
  RotateCcw,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import formStyles from '@/components/ui/Form.module.css';
import { AiError, requestAi, type AiErrorCode } from '@/services/ai/client';
import { getActiveApiKey } from '@/services/ai/keys';
import { loadAiSettings } from '@/services/ai/settings';
import type { AiSettings, AiTaskId } from '@/services/ai/types';
import { getAiAllowance, type AiUsageWarning } from '@/services/ai/usage';
import styles from './AiAssistantDialog.module.css';

type Status = 'idle' | 'running' | 'done' | 'cancelled';

type ErrorState = AiErrorCode | 'not-configured';

interface AiAssistantDialogProps {
  open: boolean;
  sourceText: string;
  scopeLabel?: string;
  applyMode?: 'replace' | 'insert';
  onClose: () => void;
  onApply: (text: string) => void;
  onOpenSettings: () => void;
}

const TASKS = [
  { id: 'cleanup', label: 'assistant.taskCleanup' },
  { id: 'proofread', label: 'assistant.taskProofread' },
  { id: 'rewrite', label: 'assistant.taskRewrite' },
  { id: 'summarize', label: 'assistant.taskSummarize' },
  { id: 'translate', label: 'assistant.taskTranslate' },
] as const satisfies ReadonlyArray<{ id: AiTaskId; label: string }>;

function errorMessageKey(code: ErrorState) {
  switch (code) {
    case 'not-configured':
      return 'assistant.notConfigured';
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

export function AiAssistantDialog({
  open,
  sourceText,
  scopeLabel,
  applyMode = 'replace',
  onClose,
  onApply,
  onOpenSettings,
}: AiAssistantDialogProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [apiKey, setApiKey] = useState('');
  const [task, setTask] = useState<AiTaskId>('proofread');
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<ErrorState | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [warning, setWarning] = useState<AiUsageWarning | null>(null);
  const [warningConfirmed, setWarningConfirmed] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'done' | 'error'>('idle');
  const controllerRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      controllerRef.current?.abort();
      return;
    }
    const loadedSettings = loadAiSettings();
    setSettings(loadedSettings);
    setApiKey(getActiveApiKey(loadedSettings.providerId)?.key ?? '');
    setTask('proofread');
    setTargetLanguage('English');
    setStatus('idle');
    setError(null);
    setResult(null);
    setCached(false);
    setWarning(null);
    setWarningConfirmed(false);
    setCopied('idle');
  }, [open]);

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

  const resetResult = () => {
    setResult(null);
    setStatus('idle');
    setError(null);
    setCached(false);
    setWarning(null);
    setWarningConfirmed(false);
    setCopied('idle');
  };

  const handleClose = () => {
    controllerRef.current?.abort();
    onClose();
  };

  const handleCancel = () => {
    controllerRef.current?.abort();
  };

  const runRequest = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('running');
    setError(null);
    setResult(null);
    setCached(false);
    setWarning(null);
    setCopied('idle');

    try {
      const response = await requestAi({
        settings,
        apiKey: apiKey.trim(),
        task,
        text: sourceText,
        ...(task === 'translate' ? { targetLanguage } : {}),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setResult(response.text);
      setCached(response.cached);
      setStatus('done');
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
    if (sourceText.trim().length === 0) {
      setError('empty-input');
      return;
    }
    if (sourceText.length > settings.guardrails.maxInputChars) {
      setError('input-too-large');
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

  const handleCopy = async () => {
    if (!result) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result);
      setCopied('done');
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied('idle'), 2200);
    } catch {
      setCopied('error');
    }
  };

  const handleApply = () => {
    if (!result) {
      return;
    }
    onApply(result);
    handleClose();
  };

  const errorKey = error ? errorMessageKey(error) : null;

  const footer = (
    <div className={styles.footer}>
      {status === 'running' ? (
        <Button variant="secondary" onClick={handleCancel}>
          <Square size={15} aria-hidden="true" />
          {t('assistant.cancelRequest')}
        </Button>
      ) : result ? (
        <>
          <Button variant="secondary" onClick={() => void handleCopy()}>
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
      ) : result ? (
        <Button variant="primary" onClick={handleApply}>
          {applyMode === 'insert' ? (
            <Plus size={15} aria-hidden="true" />
          ) : (
            <Replace size={15} aria-hidden="true" />
          )}
          {applyMode === 'insert' ? t('assistant.insert') : t('assistant.replace')}
        </Button>
      ) : (
        <Button variant="primary" onClick={handleGenerate} disabled={status === 'running'}>
          <Sparkles size={15} aria-hidden="true" />
          {status === 'running'
            ? t('assistant.generating')
            : warning
              ? t('assistant.sendAnyway')
              : t('assistant.generate')}
        </Button>
      )}

      <Button variant="ghost" onClick={handleClose}>
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
      footer={footer}
    >
      <div className={styles.body}>
        <p className={styles.scope}>
          {scopeLabel
            ? t('assistant.scopeWithLabel', { label: scopeLabel, count: sourceText.length })
            : t('assistant.scope', { count: sourceText.length })}
        </p>

        <div className={styles.controls}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ai-task">
              {t('assistant.task')}
            </label>
            <select
              id="ai-task"
              className={formStyles.select}
              value={task}
              disabled={status === 'running'}
              onChange={(event) => {
                const next = event.target.value as AiTaskId;
                setTask(next);
                resetResult();
              }}
            >
              {TASKS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </div>

          {task === 'translate' ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ai-target-language">
                {t('assistant.targetLanguage')}
              </label>
              <select
                id="ai-target-language"
                className={formStyles.select}
                value={targetLanguage}
                disabled={status === 'running'}
                onChange={(event) => {
                  setTargetLanguage(event.target.value);
                  resetResult();
                }}
              >
                <option value="English">{t('assistant.languageEnglish')}</option>
                <option value="Burmese">{t('assistant.languageBurmese')}</option>
              </select>
            </div>
          ) : null}
        </div>

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
          <div className={styles.result}>
            <div className={styles.resultHeader}>
              <span className={styles.resultTitle}>{t('assistant.result')}</span>
              <span className={styles.resultMeta}>
                {cached ? `${t('assistant.fromCache')} · ` : ''}
                {t('assistant.resultMeta', { count: result.length })}
              </span>
            </div>
            <pre className={styles.resultText}>{result}</pre>
            {copied === 'error' ? <p className={styles.hint}>{t('assistant.copyFailed')}</p> : null}
          </div>
        ) : null}

        <p className={styles.privacy}>{t('assistant.privacy')}</p>
      </div>
    </Dialog>
  );
}
