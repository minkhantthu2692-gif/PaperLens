import { useEffect, useMemo, useState } from 'react';
import { Eraser } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cleanupText, DEFAULT_CLEANUP_OPTIONS, type CleanupOptions } from '@/services/text/cleanup';
import styles from './CleanupDialog.module.css';

export type CleanupScope = 'selection' | 'document';

interface CleanupDialogProps {
  open: boolean;
  sourceText: string;
  scope: CleanupScope;
  onClose: () => void;
  onApply: (text: string) => void;
}

const PREVIEW_LIMIT = 12000;

const OPTIONS = [
  {
    key: 'normalizeUnicode',
    label: 'cleanup.normalizeUnicode',
    hint: 'cleanup.normalizeUnicodeHint',
  },
  {
    key: 'normalizeWhitespace',
    label: 'cleanup.normalizeWhitespace',
    hint: 'cleanup.normalizeWhitespaceHint',
  },
  {
    key: 'repairHyphenation',
    label: 'cleanup.repairHyphenation',
    hint: 'cleanup.repairHyphenationHint',
  },
  {
    key: 'reflowLines',
    label: 'cleanup.reflowLines',
    hint: 'cleanup.reflowLinesHint',
  },
  {
    key: 'removeDuplicateLines',
    label: 'cleanup.removeDuplicateLines',
    hint: 'cleanup.removeDuplicateLinesHint',
  },
] as const;

export function CleanupDialog({ open, sourceText, scope, onClose, onApply }: CleanupDialogProps) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<CleanupOptions>(DEFAULT_CLEANUP_OPTIONS);

  useEffect(() => {
    if (open) {
      setOptions(DEFAULT_CLEANUP_OPTIONS);
    }
  }, [open]);

  const cleaned = useMemo(() => cleanupText(sourceText, options), [sourceText, options]);
  const unchanged = cleaned === sourceText;
  const canApply = !unchanged && cleaned.trim().length > 0;
  const truncated = sourceText.length > PREVIEW_LIMIT;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        disabled={!canApply}
        onClick={() => {
          onApply(cleaned);
          onClose();
        }}
      >
        <Eraser size={16} aria-hidden="true" />
        {t('cleanup.apply')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      title={t('cleanup.title')}
      description={t('cleanup.description')}
      onClose={onClose}
      footer={footer}
    >
      <div className={styles.body}>
        <p className={styles.scope}>
          {scope === 'selection'
            ? t('cleanup.scopeSelection', { count: sourceText.length })
            : t('cleanup.scopeDocument', { count: sourceText.length })}
        </p>

        {sourceText.trim() ? (
          <>
            <fieldset className={styles.options}>
              <legend className={styles.legend}>{t('cleanup.options')}</legend>
              {OPTIONS.map((option) => (
                <label key={option.key} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={options[option.key]}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setOptions((current) => ({ ...current, [option.key]: checked }));
                    }}
                  />
                  <span className={styles.optionText}>
                    <span className={styles.optionLabel}>{t(option.label)}</span>
                    <span className={styles.optionHint}>{t(option.hint)}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <p className={styles.summary} role="status">
              {unchanged
                ? t('cleanup.unchanged')
                : t('cleanup.changeSummary', {
                    before: sourceText.length,
                    after: cleaned.length,
                  })}
            </p>

            <div className={styles.previews}>
              <div className={styles.preview}>
                <span className={styles.previewTitle}>{t('cleanup.before')}</span>
                <pre className={styles.previewText}>{sourceText.slice(0, PREVIEW_LIMIT)}</pre>
              </div>
              <div className={styles.preview}>
                <span className={styles.previewTitle}>{t('cleanup.after')}</span>
                <pre className={styles.previewText}>{cleaned.slice(0, PREVIEW_LIMIT)}</pre>
              </div>
            </div>

            {truncated ? <p className={styles.hint}>{t('cleanup.previewTruncated')}</p> : null}
          </>
        ) : (
          <p className={styles.empty} role="status">
            {t('cleanup.empty')}
          </p>
        )}
      </div>
    </Dialog>
  );
}
