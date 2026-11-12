import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { getActiveApiKey, listApiKeys } from '@/services/ai/keys';
import { loadAiSettings } from '@/services/ai/settings';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiSettingsSection key vault', () => {
  it('shows an icon for every provider in the provider popup', async () => {
    const user = userEvent.setup();
    render(<AiSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'Provider' }));

    const options = within(screen.getByRole('listbox', { name: 'Provider' })).getAllByRole(
      'option',
    );
    expect(options).toHaveLength(10);
    options.forEach((option) => {
      expect(option.querySelector('svg')).toBeInTheDocument();
    });
  });

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

    await user.click(screen.getByRole('switch', { name: /Remember the API key/ }));
    expect(localStorage.getItem('paperlens.ai.keys')).toContain('sk-personal-key');
  });

  it('saves assistant defaults, favorites, presets, and history privacy', async () => {
    const user = userEvent.setup();
    render(<AiSettingsSection />);

    await user.selectOptions(screen.getByLabelText('Default tone'), 'casual');
    await user.selectOptions(screen.getByLabelText('Default output length'), 'short');
    await user.selectOptions(screen.getByLabelText('Default translation target'), 'my');
    await user.selectOptions(screen.getByLabelText('Translation style'), 'formal');
    await user.click(screen.getByRole('button', { name: 'Choose manually' }));
    await user.selectOptions(screen.getByLabelText('Source language'), 'en');
    await user.click(screen.getByRole('button', { name: 'Simplify' }));

    await user.type(screen.getByLabelText('Preset name'), 'Brief');
    await user.type(screen.getByLabelText('Instruction'), 'Make it brief.');
    await user.click(screen.getByRole('button', { name: 'Add preset' }));
    await user.click(screen.getByRole('switch', { name: /Save AI results in history/ }));
    await user.click(screen.getByRole('button', { name: 'Save AI settings' }));

    const saved = loadAiSettings().assistant;
    expect(saved).toMatchObject({
      tone: 'casual',
      outputLength: 'short',
      translationTargetLanguage: 'my',
      translationStyle: 'formal',
      sourceLanguageMode: 'manual',
      sourceLanguage: 'en',
      historyEnabled: true,
    });
    expect(saved.favoriteActions).toContain('simplify');
    expect(screen.queryByRole('button', { name: 'Translate' })).not.toBeInTheDocument();
    expect(saved.presets).toHaveLength(1);
    expect(saved.presets[0]).toMatchObject({ name: 'Brief', instruction: 'Make it brief.' });
  });

  it('keeps all fetched models available and records selected models as recent', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'model-one' }, { id: 'model-two' }] }),
      }),
    );
    render(<AiSettingsSection />);

    await addKey(user, 'Personal', 'sk-personal-key');
    await user.click(screen.getByRole('button', { name: 'Refresh models' }));
    expect(await screen.findByText('Loaded 2 model(s).')).toBeInTheDocument();

    const modelPicker = screen.getByRole('button', { name: 'Model' });
    expect(modelPicker).toHaveTextContent('Model ID');
    await user.click(modelPicker);
    expect(screen.getByRole('option', { name: 'model-one' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'model-two' })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'model-two' }));
    await user.click(screen.getByRole('button', { name: 'Model' }));
    expect(screen.getByRole('group', { name: 'Recently used' })).toHaveTextContent('model-two');
  });
});
