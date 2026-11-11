import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { getActiveApiKey, listApiKeys } from '@/services/ai/keys';
import { AiSettingsSection } from './AiSettingsSection';

async function addKey(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  key: string,
): Promise<void> {
  await user.clear(screen.getByLabelText('Key label'));
  await user.type(screen.getByLabelText('Key label'), label);
  await user.clear(screen.getByLabelText('API key'));
  await user.type(screen.getByLabelText('API key'), key);
  await user.click(screen.getByRole('button', { name: 'Add key' }));
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await i18n.changeLanguage('en');
});

describe('AiSettingsSection key vault', () => {
  it('adds multiple keys for one provider and switches the active key', async () => {
    const user = userEvent.setup();
    render(<AiSettingsSection />);

    await addKey(user, 'Personal', 'sk-personal-key');
    await addKey(user, 'Work', 'sk-work-key');

    expect(listApiKeys('openai').map((entry) => entry.label)).toEqual(['Personal', 'Work']);
    expect(getActiveApiKey('openai')?.key).toBe('sk-personal-key');

    await user.click(screen.getByRole('radio', { name: /Work/ }));
    expect(getActiveApiKey('openai')?.key).toBe('sk-work-key');

    await user.click(screen.getByRole('button', { name: 'Remove Personal key' }));
    expect(listApiKeys('openai').map((entry) => entry.label)).toEqual(['Work']);
  });

  it('keeps keys in session storage until remembering is enabled', async () => {
    const user = userEvent.setup();
    render(<AiSettingsSection />);

    await addKey(user, 'Personal', 'sk-personal-key');
    expect(localStorage.getItem('paperlens.ai.keys')).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: /Remember the API key/ }));
    expect(localStorage.getItem('paperlens.ai.keys')).toContain('sk-personal-key');
  });
});
