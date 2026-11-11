import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownUp,
  Check,
  Clipboard,
  Clock3,
  Copy,
  Languages,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getActiveApiKey } from '@/services/ai/keys';
import { requestAi, AiError } from '@/services/ai/client';
import { loadAiSettings } from '@/services/ai/settings';
import type { AiErrorCode } from '@/services/ai/client';
import {
  deleteTranslationHistoryEntry,
  listTranslationHistory,
  saveTranslationHistory,
  type TranslationHistoryRecord,
} from '@/services/translator/history';
import { claimTranslationRequest } from '@/services/translator/throttle';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import formStyles from '@/components/ui/Form.module.css';
import { getLanguageName, TRANSLATION_LANGUAGES } from './languages';
import styles from './TranslatorDialog.module.css';

const MAX_TRANSLATION_CHARS = 1000;

type TranslatorError =
  AiErrorCode | 'text-too-long' | 'not-configured' | 'throttled' | 'paste' | 'copy' | 'history';

type TranslatorMessageKey =
  | 'translator.notConfigured'
  | 'translator.throttled'
  | 'translator.pasteFailed'
  | 'translator.copyFailed'
  | 'translator.historyError'
  | 'translator.tooLong'
  | 'assistant.dailyLimit'
  | 'assistant.monthlyLimit'
  | 'assistant.errorOffline'
  | 'assistant.errorAuth'
  | 'assistant.errorQuota'
  | 'assistant.errorRateLimit'
  | 'assistant.errorNetwork'
  | 'assistant.errorTimeout'
  | 'assistant.errorServer'
  | 'assistant.errorBusy'
  | 'assistant.errorCancelled'
  | 'assistant.errorEmpty'
  | 'assistant.inputTooLarge'
  | 'assistant.errorBadRequest'
  | 'assistant.errorInvalid'
  | 'assistant.errorGeneric';

function errorMessageKey(error: TranslatorError): TranslatorMessageKey {
  switch (error) {
    case 'not-configured':
      return 'translator.notConfigured';
    case 'throttled':
      return 'translator.throttled';
    case 'text-too-long':
      return 'translator.tooLong';
    case 'paste':
      return 'translator.pasteFailed';
    case 'copy':
      return 'translator.copyFailed';
    case 'history':
      return 'translator.historyError';
    case 'missing-key':
    case 'missing-model':
    case 'missing-base-url':
      return 'translator.notConfigured';
    case 'daily-limit':
      return 'assistant.dailyLimit';
    case 'monthly-limit':
      return 'assistant.monthlyLimit';
    case 'offline':
      return 'assistant.errorOffline';
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
    case 'input-too-large':
      return 'assistant.inputTooLarge';
    case 'bad-request':
      return 'assistant.errorBadRequest';
    case 'invalid-response':
      return 'assistant.errorInvalid';
    default:
      return 'assistant.errorGeneric';
  }
}

export interface TranslatorDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function TranslatorDialog({ open, onClose, onOpenSettings }: TranslatorDialogProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<'translate' | 'history'>('translate');
  const [sourceText, setSourceText] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('my');
  const [translation, setTranslation] = useState('');
  const [detectedSourceLanguage, setDetectedSourceLanguage] = useState<string | null>(null);
  const [error, setError] = useState<TranslatorError | null>(null);
  const [historyNotice, setHistoryNotice] = useState<TranslatorError | null>(null);
  const [running, setRunning] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<TranslationHistoryRecord[]>([]);
  const [configured, setConfigured] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
      return;
    }
    const settings = loadAiSettings();
    setConfigured(
      Boolean(settings.model.trim() && getActiveApiKey(settings.providerId)?.key.trim()),
    );
    return () => {
      abortControllerRef.current?.abort();
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, [open]);

  useEffect(() => {
    if (view !== 'history' || !open) {
      return;
    }
    let active = true;
    setHistoryLoading(true);
    setHistoryNotice(null);
    void listTranslationHistory()
      .then((records) => {
        if (active) {
          setHistory(records);
        }
      })
      .catch(() => {
        if (active) {
          setHistoryNotice('history');
        }
      })
      .finally(() => {
        if (active) {
          setHistoryLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, view]);

  const clearResult = useCallback(() => {
    setTranslation('');
    setDetectedSourceLanguage(null);
    setError(null);
  }, []);

  const translate = async () => {
    setError(null);
    setHistoryNotice(null);
    if (sourceText.length > MAX_TRANSLATION_CHARS) {
      setError('text-too-long');
      return;
    }
    if (!sourceText.trim()) {
      setError('empty-input');
      return;
    }

    const settings = loadAiSettings();
    const apiKey = getActiveApiKey(settings.providerId)?.key ?? '';
    if (!apiKey || !settings.model.trim()) {
      setConfigured(false);
      setError('not-configured');
      return;
    }

    if (!claimTranslationRequest()) {
      setError('throttled');
      return;
    }

    setRunning(true);
    setTranslation('');
    setDetectedSourceLanguage(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const detect = sourceLanguage === 'auto';
      const sourceName = detect ? undefined : getLanguageName(sourceLanguage);
      const response = await requestAi({
        settings,
        apiKey,
        task: 'translate',
        text: sourceText,
        targetLanguage: getLanguageName(targetLanguage),
        ...(sourceName ? { sourceLanguage: sourceName } : {}),
        ...(detect ? { detectSourceLanguage: true } : {}),
        signal: controller.signal,
      });
      setTranslation(response.text);
      const detected = detect ? (response.detectedSourceLanguage ?? 'und') : sourceLanguage;
      setDetectedSourceLanguage(detected);
      try {
        const saved = await saveTranslationHistory({
          sourceText,
          translatedText: response.text,
          sourceLanguage: detected,
          targetLanguage,
        });
        setHistory((entries) => [saved, ...entries].slice(0, 100));
      } catch {
        setHistoryNotice('history');
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        const code = requestError instanceof AiError ? requestError.code : 'unknown';
        if (code === 'missing-key' || code === 'missing-model' || code === 'missing-base-url') {
          setConfigured(false);
        }
        setError(code);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setRunning(false);
    }
  };

  const handlePaste = async () => {
    try {
      const pastedText = await navigator.clipboard.readText();
      setSourceText(pastedText.slice(0, MAX_TRANSLATION_CHARS + 1));
      clearResult();
      if (pastedText.length > MAX_TRANSLATION_CHARS) {
        setError('text-too-long');
      }
    } catch {
      setError('paste');
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 1800);
    } catch {
      if (view === 'history') {
        setHistoryNotice('copy');
      } else {
        setError('copy');
      }
    }
  };

  const handleSwap = () => {
    const nextTarget =
      sourceLanguage === 'auto'
        ? detectedSourceLanguage && detectedSourceLanguage !== 'und'
          ? detectedSourceLanguage
          : 'en'
        : sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(nextTarget);
    clearResult();
  };

  const handleUseHistory = (entry: TranslationHistoryRecord) => {
    setSourceText(entry.sourceText);
    setSourceLanguage(entry.sourceLanguage === 'und' ? 'auto' : entry.sourceLanguage);
    setTargetLanguage(entry.targetLanguage);
    setTranslation(entry.translatedText);
    setDetectedSourceLanguage(entry.sourceLanguage);
    setError(null);
    setHistoryNotice(null);
    setView('translate');
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await deleteTranslationHistoryEntry(id);
      setHistory((entries) => entries.filter((entry) => entry.id !== id));
    } catch {
      setHistoryNotice('history');
    }
  };

  const errorKey = error ? errorMessageKey(error) : null;

  return (
    <Dialog
      open={open}
      title={t('translator.title')}
      description={t('translator.description')}
      onClose={onClose}
      className={styles.dialog}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          {view === 'translate' ? (
            <Button
              variant="primary"
              onClick={() => void translate()}
              disabled={
                running ||
                sourceText.trim().length === 0 ||
                sourceText.length > MAX_TRANSLATION_CHARS
              }
              aria-busy={running}
            >
              {running ? (
                <LoaderCircle size={16} className={styles.spinner} aria-hidden="true" />
              ) : (
                <Languages size={16} aria-hidden="true" />
              )}
              {running ? t('translator.translating') : t('translator.translate')}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className={styles.tabs} role="tablist" aria-label={t('translator.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'translate'}
          className={view === 'translate' ? styles.activeTab : styles.tab}
          onClick={() => setView('translate')}
        >
          <Languages size={16} aria-hidden="true" />
          {t('translator.translateTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'history'}
          className={view === 'history' ? styles.activeTab : styles.tab}
          onClick={() => setView('history')}
        >
          <Clock3 size={16} aria-hidden="true" />
          {t('translator.history')} <span className={styles.historyCount}>{history.length}</span>
        </button>
      </div>

      {view === 'translate' ? (
        <div className={styles.workspace}>
          <section className={styles.languageRow} aria-label={t('translator.languageOptions')}>
            <label className={styles.languageField} htmlFor="translator-source">
              <span>{t('translator.from')}</span>
              <select
                id="translator-source"
                className={formStyles.select}
                value={sourceLanguage}
                disabled={running}
                onChange={(event) => {
                  setSourceLanguage(event.target.value);
                  clearResult();
                }}
              >
                <option value="auto">{t('translator.autoDetect')}</option>
                {TRANSLATION_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              className={styles.swapButton}
              onClick={handleSwap}
              disabled={running}
              aria-label={t('translator.swap')}
              title={t('translator.swap')}
            >
              <ArrowDownUp size={17} aria-hidden="true" />
            </Button>
            <label className={styles.languageField} htmlFor="translator-target">
              <span>{t('translator.to')}</span>
              <select
                id="translator-target"
                className={formStyles.select}
                value={targetLanguage}
                disabled={running}
                onChange={(event) => {
                  setTargetLanguage(event.target.value);
                  clearResult();
                }}
              >
                {TRANSLATION_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <div className={styles.columns}>
            <section className={styles.textCard}>
              <div className={styles.cardHeader}>
                <label htmlFor="translator-input">{t('translator.input')}</label>
                <div className={styles.cardActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handlePaste()}
                    disabled={running}
                  >
                    <Clipboard size={14} aria-hidden="true" />
                    {t('translator.paste')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSourceText('');
                      clearResult();
                    }}
                    disabled={!sourceText || running}
                  >
                    {t('common.clear')}
                  </Button>
                </div>
              </div>
              <textarea
                id="translator-input"
                className={styles.textarea}
                value={sourceText}
                maxLength={MAX_TRANSLATION_CHARS + 1}
                disabled={running}
                onChange={(event) => {
                  setSourceText(event.target.value);
                  clearResult();
                }}
                placeholder={t('translator.inputPlaceholder')}
                aria-describedby="translator-counter"
              />
              <div className={styles.cardFooter}>
                {detectedSourceLanguage && sourceLanguage === 'auto' ? (
                  <span>
                    {t('translator.detected', {
                      language: getLanguageName(detectedSourceLanguage),
                    })}
                  </span>
                ) : (
                  <span />
                )}
                <span className={styles.counterGroup}>
                  {sourceText.length > MAX_TRANSLATION_CHARS ? (
                    <span className={styles.overLimit} role="status">
                      {t('translator.tooLong')}
                    </span>
                  ) : null}
                  <span
                    id="translator-counter"
                    className={sourceText.length > MAX_TRANSLATION_CHARS ? styles.overLimit : ''}
                    aria-live="polite"
                  >
                    {t('translator.characterCount', {
                      count: sourceText.length,
                      max: MAX_TRANSLATION_CHARS,
                    })}
                  </span>
                </span>
              </div>
            </section>

            <section className={styles.textCard}>
              <div className={styles.cardHeader}>
                <span>{t('translator.result')}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopy(translation)}
                  disabled={!translation}
                  aria-label={t('translator.copy')}
                >
                  {copied ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  {copied ? t('translator.copied') : t('translator.copy')}
                </Button>
              </div>
              <div
                className={styles.output}
                role="region"
                aria-label={t('translator.result')}
                aria-live="polite"
              >
                {running ? (
                  <span className={styles.loading}>
                    <LoaderCircle size={17} className={styles.spinner} aria-hidden="true" />
                    {t('translator.translating')}
                  </span>
                ) : translation ? (
                  translation
                ) : (
                  <span className={styles.placeholder}>{t('translator.outputPlaceholder')}</span>
                )}
              </div>
            </section>
          </div>

          {!configured || error === 'not-configured' ? (
            <div className={formStyles.alert} role="status">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{t('translator.notConfigured')}</span>
              <Button size="sm" variant="secondary" onClick={onOpenSettings}>
                {t('translator.openSettings')}
              </Button>
            </div>
          ) : null}
          {errorKey && error !== 'not-configured' ? (
            <div className={formStyles.alert} role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{t(errorKey)}</span>
            </div>
          ) : null}
          {historyNotice ? (
            <div className={formStyles.alert} role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{t(errorMessageKey(historyNotice))}</span>
            </div>
          ) : null}
          <p className={styles.privacy}>{t('translator.privacy')}</p>
        </div>
      ) : (
        <div className={styles.historyPanel}>
          {historyNotice ? (
            <div className={formStyles.alert} role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{t(errorMessageKey(historyNotice))}</span>
            </div>
          ) : null}
          {errorKey ? (
            <div className={formStyles.alert} role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{t(errorKey)}</span>
            </div>
          ) : null}
          {historyLoading ? (
            <p className={styles.historyState} role="status">
              {t('common.loading')}
            </p>
          ) : history.length === 0 && historyNotice !== 'history' ? (
            <p className={styles.historyState}>{t('translator.historyEmpty')}</p>
          ) : history.length > 0 ? (
            <div className={styles.historyList}>
              {history.map((entry) => (
                <article className={styles.historyItem} key={entry.id}>
                  <div className={styles.historyMeta}>
                    <span>
                      {getLanguageName(entry.sourceLanguage)} →{' '}
                      {getLanguageName(entry.targetLanguage)}
                    </span>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(entry.createdAt)}
                    </time>
                  </div>
                  <div className={styles.historyColumns}>
                    <p>{entry.sourceText}</p>
                    <p>{entry.translatedText}</p>
                  </div>
                  <div className={styles.historyActions}>
                    <Button size="sm" variant="secondary" onClick={() => handleUseHistory(entry)}>
                      {t('translator.use')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCopy(entry.translatedText)}
                    >
                      {copied ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )}
                      {copied ? t('translator.copied') : t('translator.copy')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      onClick={() => void handleDeleteHistory(entry.id)}
                      aria-label={t('translator.deleteHistory')}
                      title={t('translator.deleteHistory')}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
