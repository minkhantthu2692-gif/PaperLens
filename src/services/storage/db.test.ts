import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openDBMock } = vi.hoisted(() => ({ openDBMock: vi.fn() }));

vi.mock('idb', () => ({ openDB: openDBMock }));

interface FakeStore {
  name: string;
  createIndex: ReturnType<typeof vi.fn>;
}

function fakeDatabase() {
  const stores: FakeStore[] = [];
  const createObjectStore = vi.fn((name: string) => {
    const store: FakeStore = { name, createIndex: vi.fn() };
    stores.push(store);
    return store;
  });
  return { createObjectStore, stores };
}

beforeEach(() => {
  openDBMock.mockReset();
  vi.resetModules();
});

describe('database migrations', () => {
  it('adds translation history when upgrading a version 2 database', async () => {
    const database = fakeDatabase();
    openDBMock.mockImplementation(
      (
        _name: string,
        _version: number,
        config: { upgrade: (db: unknown, oldVersion: number) => void },
      ) => {
        config.upgrade(database, 2);
        return Promise.resolve(database);
      },
    );

    const { DATABASE_VERSION, getDatabase } = await import('./db');
    await getDatabase();

    expect(DATABASE_VERSION).toBe(3);
    expect(database.createObjectStore).toHaveBeenCalledTimes(1);
    expect(database.createObjectStore).toHaveBeenCalledWith('translationHistory', {
      keyPath: 'id',
    });
    expect(database.stores[0]?.createIndex).toHaveBeenCalledWith('by-createdAt', 'createdAt');
  });

  it('creates all stores for a fresh database', async () => {
    const database = fakeDatabase();
    openDBMock.mockImplementation(
      (
        _name: string,
        _version: number,
        config: { upgrade: (db: unknown, oldVersion: number) => void },
      ) => {
        config.upgrade(database, 0);
        return Promise.resolve(database);
      },
    );

    const { getDatabase } = await import('./db');
    await getDatabase();

    expect(database.stores.map((store) => store.name)).toEqual([
      'documents',
      'assets',
      'aiCache',
      'translationHistory',
    ]);
  });
});
