import { afterEach, describe, expect, it } from 'vitest';
import {
  FULL_WORKSPACE_ENABLED_KEY,
  persistFullWorkspaceEnabled,
  readFullWorkspaceEnabled,
} from './fullWorkspace';

describe('full workspace preference', () => {
  afterEach(() => {
    localStorage.removeItem(FULL_WORKSPACE_ENABLED_KEY);
  });

  it('defaults to disabled and persists changes', () => {
    expect(readFullWorkspaceEnabled()).toBe(false);

    persistFullWorkspaceEnabled(true);
    expect(readFullWorkspaceEnabled()).toBe(true);

    persistFullWorkspaceEnabled(false);
    expect(readFullWorkspaceEnabled()).toBe(false);
  });
});
