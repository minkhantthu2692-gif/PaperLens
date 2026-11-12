import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDatabaseMock } = vi.hoisted(() => ({ getDatabaseMock: vi.fn() }));

vi.mock('@/services/storage/db', () => ({ getDatabase: getDatabaseMock }));

beforeEach(() => {
  getDatabaseMock.mockReset();
});

describe('AI history storage', () => {
  it('saves a result and trims the oldest records to the history limit', async () => {
    const deleteMock = vi.fn();
    const getAllKeysMock = vi
      .fn()
      .mockResolvedValue(Array.from({ length: 52 }, (_, index) => `entry-${index}`));
    const store = {
      put: vi.fn().mockResolvedValue(undefined),
      index: vi.fn(() => ({ getAllKeys: getAllKeysMock })),
      delete: deleteMock,
    };
    const transaction = { store, done: Promise.resolve() };
    getDatabaseMock.mockResolvedValue({ transaction: vi.fn(() => transaction) });

    const { saveAiHistory } = await import('./history');
    const saved = await saveAiHistory({
      actionId: 'proofread',
      task: 'proofread',
      providerId: 'openai',
      model: 'test-model',
      sourceText: 'Original',
      resultText: 'Improved',
    });

    expect(saved).toMatchObject({
      actionId: 'proofread',
      task: 'proofread',
      providerId: 'openai',
      model: 'test-model',
      sourceText: 'Original',
      resultText: 'Improved',
    });
    expect(saved.id).toBeTruthy();
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledWith('entry-0');
    expect(deleteMock).toHaveBeenCalledWith('entry-1');
  });

  it('lists history newest first and clears it', async () => {
    const records = [
      { id: 'old', createdAt: 1 },
      { id: 'new', createdAt: 2 },
    ];
    const getAllFromIndex = vi.fn().mockResolvedValue(records);
    const clear = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    getDatabaseMock.mockResolvedValue({ getAllFromIndex, clear, delete: remove });

    const { clearAiHistory, deleteAiHistoryEntry, listAiHistory } = await import('./history');
    await expect(listAiHistory()).resolves.toEqual([...records].reverse());
    await deleteAiHistoryEntry('old');
    expect(remove).toHaveBeenCalledWith('aiHistory', 'old');
    await clearAiHistory();
    expect(clear).toHaveBeenCalledWith('aiHistory');
  });
});
