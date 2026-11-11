import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { AiError } from '@/services/ai/client';
import { addApiKey } from '@/services/ai/keys';
import { saveAiSettings } from '@/services/ai/settings';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/types';
import { AiAssistantDialog } from './AiAssistantDialog';

const aiMocks = vi.hoisted(() => ({
  requestAi: vi.fn(),
}));

vi.mock('@/services/ai/client', () => {
  class MockAiError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.name = 'AiError';
      this.code = code;
    }
  }

  return {
    AiError: MockAiError,
    requestAi: aiMocks.requestAi,
  };
});

function renderDialog(
  sourceText = 'Selected paragraph',
  handlers: { onApply?: () => void; onClose?: () => void; onOpenSettings?: () => void } = {},
) {
  return render(
    <AiAssistantDialog
      open
      sourceText={sourceText}
      onApply={handlers.onApply ?? vi.fn()}
      onClose={handlers.onClose ?? vi.fn()}
      onOpenSettings={handlers.onOpenSettings ?? vi.fn()}
    />,
  );
}

beforeEach(async () => {
  aiMocks.requestAi.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  await i18n.changeLanguage('en');
});

describe('AiAssistantDialog', () => {
  it('sends the selected text and replaces the selection with the result', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, providerId: 'openai', model: 'test-model' });
    addApiKey({ providerId: 'openai', label: 'Test', key: 'test-key' }, false);
    aiMocks.requestAi.mockResolvedValue({
      text: 'Improved text',
      providerId: 'openai',
      model: 'test-model',
      retries: 0,
      inputChars: 17,
      outputChars: 13,
    });

    renderDialog('Selected paragraph', { onApply });

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('Improved text')).toBeInTheDocument();
    expect(aiMocks.requestAi).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        task: 'proofread',
        text: 'Selected paragraph',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Replace selection' }));
    expect(onApply).toHaveBeenCalledWith('Improved text');
  });

  it('shows configuration guidance when no key is stored', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    renderDialog('Selected paragraph', { onOpenSettings });

    expect(screen.getByText(/Add a provider, model, and API key/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open AI settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('blocks selected text above the configured input limit', async () => {
    const user = userEvent.setup();
    saveAiSettings({
      ...DEFAULT_AI_SETTINGS,
      providerId: 'openai',
      model: 'test-model',
      guardrails: { ...DEFAULT_AI_SETTINGS.guardrails, maxInputChars: 500 },
    });
    addApiKey({ providerId: 'openai', label: 'Test', key: 'test-key' }, false);

    renderDialog('a'.repeat(600));

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText(/longer than the configured input limit/)).toBeInTheDocument();
    expect(aiMocks.requestAi).not.toHaveBeenCalled();
  });

  it('surfaces provider errors and allows retrying', async () => {
    const user = userEvent.setup();
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, providerId: 'openai', model: 'test-model' });
    addApiKey({ providerId: 'openai', label: 'Test', key: 'test-key' }, false);
    aiMocks.requestAi.mockRejectedValue(new AiError('auth'));

    renderDialog('Selected paragraph');

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText(/The provider rejected the API key/)).toBeInTheDocument();
    await waitFor(() => expect(aiMocks.requestAi).toHaveBeenCalledTimes(1));
  });
});
