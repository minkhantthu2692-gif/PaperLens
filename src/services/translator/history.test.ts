import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDatabaseMock } = vi.hoisted(() => ({ getDatabaseMock: vi.fn() }));

vi.mock('@/services/storage/db', () => ({ getDatabase: getDatabaseMock }));

beforeEach(() => {
  getDatabaseMock.mockReset();
});

describe('translation history storage', () => {
  it('persists entries and trims the oldest records to the history limit', async () => {
    const deleteMock = vi.fn();
    const getAllKeysMock = vi
      .fn()
      .mockResolvedValue(Array.from({ length: 102 }, (_, index) => `entry-${index}`));
    const store = {
      put: vi.fn().mockResolvedValue(undefined),
      index: vi.fn(() => ({ getAllKeys: getAllKeysMock })),
      delete: deleteMock,
    };
    const transaction = { store, done: Promise.resolve() };
    getDatabaseMock.mockResolvedValue({ transaction: vi.fn(() => transaction) });

    const { saveTranslationHistory } = await import('./history');
    const saved = await saveTranslationHistory({
      sourceText: 'Hello',
      translatedText: 'Hola',
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });

    expect(saved).toMatchObject({
      sourceText: 'Hello',
      translatedText: 'Hola',
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });
    expect(saved.id).toBeTruthy();
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledWith('entry-0');
    expect(deleteMock).toHaveBeenCalledWith('entry-1');
  });

  it('returns history newest first and deletes individual entries', async () => {
    const records = [
      { id: 'old', createdAt: 1 },
      { id: 'new', createdAt: 2 },
    ];
    const getAllFromIndex = vi.fn().mockResolvedValue(records);
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    getDatabaseMock.mockResolvedValue({
      getAllFromIndex,
      delete: deleteMock,
    });

    const { deleteTranslationHistoryEntry, listTranslationHistory } = await import('./history');
    await expect(listTranslationHistory()).resolves.toEqual([...records].reverse());
    await deleteTranslationHistoryEntry('old');
    expect(deleteMock).toHaveBeenCalledWith('translationHistory', 'old');
  });
});
