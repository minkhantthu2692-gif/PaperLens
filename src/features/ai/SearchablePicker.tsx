import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import styles from './SearchablePicker.module.css';

export interface SearchablePickerOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface SearchablePickerFilter {
  value: string;
  label: string;
  count: number;
  matches: (option: SearchablePickerOption) => boolean;
}

interface SearchablePickerProps {
  label: string;
  value: string;
  options: readonly SearchablePickerOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  recentValues?: readonly string[];
  recentLabel?: string;
  allLabel?: string;
  allFilterLabel?: string;
  filters?: readonly SearchablePickerFilter[];
  allowCustomValue?: boolean;
  customValueLabel?: (value: string) => string;
}

export function SearchablePicker({
  label,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  recentValues = [],
  recentLabel = '',
  allLabel = '',
  allFilterLabel = '',
  filters = [],
  allowCustomValue = false,
  customValueLabel,
}: SearchablePickerProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? value;
  const activeFilterOption = filters.find((filter) => filter.value === activeFilter);
  const matchesActiveFilter = (option: SearchablePickerOption) =>
    !activeFilterOption || activeFilterOption.matches(option);
  const filteredOptions = options.filter(
    (option) =>
      matchesActiveFilter(option) && option.label.toLocaleLowerCase().includes(normalizedQuery),
  );
  const filteredRecent = recentValues
    .map((recent) => options.find((option) => option.value === recent))
    .filter((option): option is SearchablePickerOption => option !== undefined)
    .filter(
      (option) =>
        matchesActiveFilter(option) && option.label.toLocaleLowerCase().includes(normalizedQuery),
    );
  const recentSet = new Set(filteredRecent.map((option) => option.value));
  const remainingOptions = filteredOptions.filter((option) => !recentSet.has(option.value));
  const exactMatch = options.some((option) => option.value.toLocaleLowerCase() === normalizedQuery);
  const customValue = query.trim();

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const closePicker = () => {
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    closePicker();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (allowCustomValue && customValue && !exactMatch) {
      selectValue(customValue);
    } else {
      const firstOption = filteredRecent[0] ?? filteredOptions[0];
      if (firstOption) {
        selectValue(firstOption.value);
      }
    }
  };

  const renderOption = (option: SearchablePickerOption) => (
    <button
      key={option.value}
      type="button"
      role="option"
      aria-selected={value === option.value}
      className={styles.option}
      onClick={() => selectValue(option.value)}
    >
      {option.icon ? <span className={styles.optionIcon}>{option.icon}</span> : null}
      <span className={styles.optionLabel}>{option.label}</span>
      {value === option.value ? <Check size={16} aria-hidden="true" /> : null}
    </button>
  );

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setQuery('');
          setActiveFilter('');
          setOpen((current) => !current);
        }}
      >
        {selectedOption?.icon ? (
          <span className={styles.triggerIcon} aria-hidden="true">
            {selectedOption.icon}
          </span>
        ) : null}
        <span className={styles.triggerValue}>{selectedLabel || placeholder}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={open ? styles.chevronOpen : undefined}
        />
      </button>

      {open
        ? createPortal(
            <div
              className={styles.backdrop}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closePicker();
                }
              }}
            >
              <section
                ref={dialogRef}
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                onKeyDown={(event) => {
                  if (event.key !== 'Tab') {
                    return;
                  }
                  const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled)',
                  );
                  if (!focusable?.length) {
                    return;
                  }
                  const first = focusable[0];
                  const last = focusable[focusable.length - 1];
                  if (!first || !last) {
                    return;
                  }
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                  }
                }}
              >
                <header className={styles.header}>
                  <div className={styles.heading}>
                    <span className={styles.eyebrow}>{label}</span>
                    <h2 id={`${id}-title`}>{label}</h2>
                    <p className={styles.selected}>
                      {selectedOption?.icon ? (
                        <span className={styles.selectedIcon} aria-hidden="true">
                          {selectedOption.icon}
                        </span>
                      ) : null}
                      <span>{selectedLabel || placeholder}</span>
                      <Check size={15} aria-hidden="true" />
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.close}
                    aria-label={`Close ${label} picker`}
                    onClick={closePicker}
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.search}>
                  <Search size={18} aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    name={`paperlens-picker-search-${id}`}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={query}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    aria-controls={id}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                  />
                </div>

                {filters.length > 0 ? (
                  <div className={styles.filters} role="group" aria-label={allFilterLabel}>
                    <button
                      type="button"
                      className={styles.filter}
                      aria-pressed={activeFilter === ''}
                      onClick={() => setActiveFilter('')}
                    >
                      {allFilterLabel}
                      <span>{options.length}</span>
                    </button>
                    {filters.map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        className={styles.filter}
                        aria-pressed={activeFilter === filter.value}
                        onClick={() => setActiveFilter(filter.value)}
                      >
                        {filter.label}
                        <span>{filter.count}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div id={id} className={styles.options} role="listbox" aria-label={label}>
                  {filteredRecent.length > 0 ? (
                    <div role="group" aria-label={recentLabel} className={styles.group}>
                      <span className={styles.groupLabel}>{recentLabel}</span>
                      {filteredRecent.map(renderOption)}
                    </div>
                  ) : null}

                  {remainingOptions.length > 0 ? (
                    <div role="group" aria-label={allLabel} className={styles.group}>
                      {allLabel ? <span className={styles.groupLabel}>{allLabel}</span> : null}
                      {remainingOptions.map(renderOption)}
                    </div>
                  ) : null}

                  {allowCustomValue && customValue && !exactMatch ? (
                    <div className={styles.group}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={value === customValue}
                        className={styles.option}
                        onClick={() => selectValue(customValue)}
                      >
                        <span className={styles.optionLabel}>
                          {customValueLabel?.(customValue) ?? customValue}
                        </span>
                      </button>
                    </div>
                  ) : null}

                  {filteredOptions.length === 0 &&
                  !(allowCustomValue && customValue && !exactMatch) ? (
                    <p className={styles.empty}>{emptyMessage}</p>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
