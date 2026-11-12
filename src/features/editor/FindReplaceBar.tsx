import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import type { Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, Replace, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { findMatches } from './search';
import { applySearchHighlights, clearSearchHighlights } from './searchHighlight';
import styles from './FindReplaceBar.module.css';

interface FindReplaceBarProps {
  editor: Editor;
  scrollRef: RefObject<HTMLDivElement | null>;
  showReplace: boolean;
  onToggleReplace: () => void;
  onClose: () => void;
  focusSignal: number;
}

export function FindReplaceBar({
  editor,
  scrollRef,
  showReplace,
  onToggleReplace,
  onClose,
  focusSignal,
}: FindReplaceBarProps) {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const previousShowReplaceRef = useRef(showReplace);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [document, setDocument] = useState(() => editor.state.doc);
  const [, setSelectionTick] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // TipTap owns the document, so re-run the search whenever the editor
  // content changes and re-render when the editor selection changes (used to
  // decide whether "selected text only" is available).
  useEffect(() => {
    const handleUpdate = () => setDocument(editor.state.doc);
    const handleSelection = () => setSelectionTick((value) => value + 1);
    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleSelection);
    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleSelection);
    };
  }, [editor]);

  const result = useMemo(
    () => findMatches(document, { query, matchCase, wholeWord, range }),
    [document, query, matchCase, wholeWord, range],
  );

  const { matches, truncated } = result;
  const resolvedIndex = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1);
  const activeMatch = resolvedIndex >= 0 ? matches[resolvedIndex] : undefined;
  const selectionEmpty = editor.state.selection.empty;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, matchCase, wholeWord, range]);

  useEffect(() => {
    applySearchHighlights(editor, { matches, activeIndex: resolvedIndex });
  }, [editor, matches, resolvedIndex]);

  useEffect(() => {
    return () => clearSearchHighlights(editor);
  }, [editor]);

  useEffect(() => {
    const input = searchInputRef.current;
    input?.focus();
    input?.select();
  }, [focusSignal]);

  useEffect(() => {
    if (showReplace && !previousShowReplaceRef.current) {
      replaceInputRef.current?.focus();
    }
    previousShowReplaceRef.current = showReplace;
  }, [showReplace]);

  // Scroll the active hit into view without moving the editor selection or
  // the caret, so editing and the AI selection bubble stay untouched.
  useEffect(() => {
    if (!activeMatch) {
      return;
    }
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    try {
      const start = editor.view.coordsAtPos(activeMatch.from);
      const end = editor.view.coordsAtPos(activeMatch.to);
      const bounds = scroller.getBoundingClientRect();
      const top = Math.min(start.top, end.top) - bounds.top + scroller.scrollTop;
      const bottom = Math.max(start.bottom, end.bottom) - bounds.top + scroller.scrollTop;
      const viewTop = scroller.scrollTop;
      const viewBottom = viewTop + scroller.clientHeight;
      const margin = 48;
      if (top < viewTop + margin) {
        scroller.scrollTop = Math.max(0, top - margin);
      } else if (bottom > viewBottom - margin) {
        scroller.scrollTop = bottom - scroller.clientHeight + margin;
      }
    } catch {
      // The editor may be detached (for example during a document switch).
    }
  }, [editor, scrollRef, activeMatch]);

  const move = useCallback(
    (delta: number) => {
      if (matches.length === 0) {
        return;
      }
      setActiveIndex((current) => {
        const base = current < 0 ? 0 : Math.min(current, matches.length - 1);
        return (base + delta + matches.length) % matches.length;
      });
    },
    [matches.length],
  );

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const replaceCurrent = () => {
    if (!activeMatch) {
      return;
    }
    const transaction = editor.state.tr.insertText(replacement, activeMatch.from, activeMatch.to);
    editor.view.dispatch(transaction);
  };

  const replaceAll = () => {
    if (matches.length === 0) {
      return;
    }
    // Apply edits from the end so earlier document positions stay valid, and
    // dispatch once so Undo reverts the whole replacement atomically.
    let transaction = editor.state.tr;
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index];
      if (match) {
        transaction = transaction.insertText(replacement, match.from, match.to);
      }
    }
    editor.view.dispatch(transaction);
    setActiveIndex(0);
    setConfirmOpen(false);
  };

  const toggleRange = () => {
    if (range) {
      setRange(null);
      return;
    }
    const { from, to } = editor.state.selection;
    if (to > from) {
      setRange({ from, to });
    }
  };

  const countLabel =
    matches.length > 0
      ? t('editor.searchCount', { current: resolvedIndex + 1, total: matches.length })
      : query
        ? t('editor.searchNoResults')
        : t('editor.searchEmpty');

  return (
    <>
      <form
        className={styles.panel}
        role="search"
        aria-label={t('editor.findAndReplace')}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={styles.row}>
          <Search size={15} aria-hidden="true" className={styles.leadingIcon} />
          <input
            ref={searchInputRef}
            className={styles.input}
            type="text"
            value={query}
            placeholder={t('editor.searchPlaceholder')}
            aria-label={t('editor.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {query ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => {
                setQuery('');
                searchInputRef.current?.focus();
              }}
              aria-label={t('editor.searchClear')}
              title={t('editor.searchClear')}
            >
              <X size={14} aria-hidden="true" />
            </Button>
          ) : null}
          <span className={styles.count} role="status" aria-live="polite">
            {countLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => move(-1)}
            disabled={matches.length === 0}
            aria-label={t('editor.searchPrevious')}
            title={t('editor.searchPrevious')}
          >
            <ChevronUp size={15} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => move(1)}
            disabled={matches.length === 0}
            aria-label={t('editor.searchNext')}
            title={t('editor.searchNext')}
          >
            <ChevronDown size={15} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            className={showReplace ? styles.active : undefined}
            onClick={onToggleReplace}
            aria-label={t('editor.searchReplaceToggle')}
            title={t('editor.searchReplaceToggle')}
            aria-expanded={showReplace}
            aria-pressed={showReplace}
          >
            <Replace size={15} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onClose}
            aria-label={t('editor.searchClose')}
            title={t('editor.searchClose')}
          >
            <X size={15} aria-hidden="true" />
          </Button>
        </div>

        {showReplace ? (
          <div className={styles.row}>
            <Replace size={15} aria-hidden="true" className={styles.leadingIcon} />
            <input
              ref={replaceInputRef}
              className={styles.input}
              type="text"
              value={replacement}
              placeholder={t('editor.replacePlaceholder')}
              aria-label={t('editor.replacePlaceholder')}
              onChange={(event) => setReplacement(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  replaceCurrent();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                }
              }}
            />
            <Button variant="secondary" size="sm" onClick={replaceCurrent} disabled={!activeMatch}>
              {t('editor.searchReplace')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={matches.length === 0}
            >
              {t('editor.searchReplaceAll')}
            </Button>
          </div>
        ) : null}

        <div className={styles.options}>
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(event) => setMatchCase(event.target.checked)}
            />
            <span>{t('editor.searchMatchCase')}</span>
          </label>
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(event) => setWholeWord(event.target.checked)}
            />
            <span>{t('editor.searchWholeWord')}</span>
          </label>
          <label className={styles.option} title={t('editor.searchInSelectionHint')}>
            <input
              type="checkbox"
              checked={range !== null}
              disabled={!range && selectionEmpty}
              onChange={toggleRange}
            />
            <span>{t('editor.searchInSelection')}</span>
          </label>
        </div>

        {truncated ? (
          <p className={styles.hint} role="status">
            {t('editor.searchTruncated', { count: matches.length })}
          </p>
        ) : null}
      </form>

      <Dialog
        open={confirmOpen}
        title={t('editor.searchReplaceAllTitle')}
        description={t('editor.searchReplaceAllConfirm', { count: matches.length })}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={replaceAll}>
              {t('editor.searchReplaceAll')}
            </Button>
          </>
        }
      />
    </>
  );
}
