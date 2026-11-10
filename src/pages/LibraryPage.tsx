import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  FileText,
  FileType2,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import formStyles from '@/components/ui/Form.module.css';
import type { DocumentRecord } from '@/domain/document';
import { formatDate } from '@/lib/format';
import { ImportValidationError } from '@/services/import/fileValidation';
import { importDocumentFile } from '@/services/import/importDocument';
import { deleteDocument, listDocuments, renameDocument } from '@/services/storage/documents';
import styles from './LibraryPage.module.css';

const ACCEPTED_FILES = '.pdf,.png,.jpg,.jpeg,.webp,.txt';

type ImportErrorKey =
  | 'library.invalidEmpty'
  | 'library.invalidTooLarge'
  | 'library.invalidUnsupported'
  | 'library.invalidCorrupt'
  | 'library.importError';

function getImportErrorKey(error: unknown): ImportErrorKey {
  if (error instanceof ImportValidationError) {
    switch (error.code) {
      case 'empty':
        return 'library.invalidEmpty';
      case 'too-large':
        return 'library.invalidTooLarge';
      case 'unsupported':
        return 'library.invalidUnsupported';
      case 'corrupt':
        return 'library.invalidCorrupt';
    }
  }
  return 'library.importError';
}

function sourceIcon(kind: DocumentRecord['source']['kind']) {
  if (kind === 'pdf') {
    return FileType2;
  }
  if (kind === 'image') {
    return ImageIcon;
  }
  return FileText;
}

export default function LibraryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(await listDocuments());
      setError(null);
    } catch {
      setError(t('library.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFile = useCallback(
    async (file: File) => {
      setImporting(true);
      setError(null);
      try {
        const document = await importDocumentFile(file);
        navigate(`/workspace/${document.id}`);
      } catch (importError) {
        setError(t(getImportErrorKey(importError)));
      } finally {
        setImporting(false);
      }
    },
    [navigate, t],
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      void handleFile(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) {
      return;
    }
    const title = renameValue.trim().slice(0, 120);
    if (!title) {
      return;
    }
    setBusy(true);
    try {
      await renameDocument(renameTarget.id, title);
      setRenameTarget(null);
      await refresh();
    } catch {
      setError(t('library.renameError'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setBusy(true);
    try {
      await deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch {
      setError(t('library.deleteError'));
    } finally {
      setBusy(false);
    }
  };

  const importButton = (
    <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={importing}>
      <Upload size={17} aria-hidden="true" />
      {importing ? t('library.importing') : t('library.importAction')}
    </Button>
  );

  return (
    <div className={styles.page}>
      <TopBar title={t('library.title')} subtitle={t('library.subtitle')} actions={importButton} />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILES}
        className={styles.hiddenInput}
        onChange={handleInputChange}
        aria-label={t('library.importAction')}
      />

      <div className={styles.content}>
        {error ? (
          <div className={formStyles.alert} role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div
          className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <Upload size={20} aria-hidden="true" />
          <div>
            <p className={styles.dropTitle}>
              {dragging ? t('library.dropActive') : t('library.dropTitle')}
            </p>
            <p className={styles.dropHint}>{t('library.dropHint')}</p>
          </div>
        </div>

        {loading ? (
          <p className={styles.muted} role="status">
            {t('common.loading')}
          </p>
        ) : null}

        {!loading && documents.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <FileText size={26} aria-hidden="true" />
            </span>
            <h2>{t('library.emptyTitle')}</h2>
            <p>{t('library.emptyDescription')}</p>
            {importButton}
          </div>
        ) : null}

        {documents.length > 0 ? (
          <ul className={styles.grid}>
            {documents.map((document) => {
              const Icon = sourceIcon(document.source.kind);
              const wordCount = document.editor.text.trim()
                ? document.editor.text.trim().split(/\s+/u).length
                : 0;
              return (
                <li key={document.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardIcon}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <div className={styles.cardBody}>
                      <Link to={`/workspace/${document.id}`} className={styles.cardTitle}>
                        {document.title}
                      </Link>
                      <p className={styles.cardMeta}>
                        {t('library.updated', {
                          date: formatDate(document.updatedAt, i18n.language),
                        })}
                      </p>
                      <p className={styles.cardMeta}>
                        {t('library.words', { count: wordCount })} ·{' '}
                        {document.source.kind.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRenameTarget(document);
                        setRenameValue(document.title);
                      }}
                      aria-label={`${t('common.rename')}: ${document.title}`}
                      title={t('common.rename')}
                    >
                      <Pencil size={15} aria-hidden="true" />
                      {t('common.rename')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(document)}
                      aria-label={`${t('common.delete')}: ${document.title}`}
                      title={t('common.delete')}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <Dialog
        open={renameTarget !== null}
        title={t('library.renameTitle')}
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleRename()} disabled={busy}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="rename-document">
            {t('library.renameLabel')}
          </label>
          <input
            id="rename-document"
            className={formStyles.input}
            value={renameValue}
            maxLength={120}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleRename();
              }
            }}
            autoFocus
          />
        </div>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        title={t('library.deleteTitle')}
        description={
          deleteTarget ? t('library.deleteDescription', { title: deleteTarget.title }) : undefined
        }
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} disabled={busy}>
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  );
}
