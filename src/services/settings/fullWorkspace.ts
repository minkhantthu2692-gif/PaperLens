export const FULL_WORKSPACE_ENABLED_KEY = 'paperlens.full-workspace.enabled';

export function readFullWorkspaceEnabled(): boolean {
  try {
    return localStorage.getItem(FULL_WORKSPACE_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function persistFullWorkspaceEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FULL_WORKSPACE_ENABLED_KEY, String(enabled));
  } catch {
    // The preference still applies for this session when storage is unavailable.
  }
}
