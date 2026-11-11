import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { addApiKey } from '@/services/ai/keys';
import { saveAiSettings } from '@/services/ai/settings';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/types';
import { resetTranslationThrottle } from '@/services/translator/throttle';
import { TranslatorDialog } from './TranslatorDialog';

const mocks = vi.hoisted(() => ({
  requestAi: vi.fn(),
  deleteTranslationHistoryEntry: vi.fn(),
  listTranslationHistory: vi.fn(),
  saveTranslationHistory: vi.fn(),
}));

vi.mock('@/services/ai/client', () => ({
  AiError: class MockAiError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  requestAi: mocks.requestAi,
}));

vi.mock('@/services/translator/history', () => ({
  deleteTranslationHistoryEntry: mocks.deleteTranslationHistoryEntry,
  listTranslationHistory: mocks.listTranslationHistory,
  saveTranslationHistory: mocks.saveTranslationHistory,
}));

function renderDialog(handlers: { onClose?: () => void; onOpenSettings?: () => void } = {}) {
  return render(
    <TranslatorDialog
      open
      onClose={handlers.onClose ?? vi.fn()}
      onOpenSettings={handlers.onOpenSettings ?? vi.fn()}
    />,
  );
}

beforeEach(async () => {
  mocks.requestAi.mockReset();
  mocks.deleteTranslationHistoryEntry.mockReset().mockResolvedValue(undefined);
  mocks.listTranslationHistory.mockReset().mockResolvedValue([]);
  mocks.saveTranslationHistory.mockReset().mockImplementation(async (record) => ({
    ...record,
    id: 'history-1',
    createdAt: Date.now(),
  }));
  resetTranslationThrottle();
  localStorage.clear();
  sessionStorage.clear();
  await i18n.changeLanguage('en');
});

describe('TranslatorDialog', () => {
  it('translates with the configured provider and records detection/history', async () => {
    const user = userEvent.setup();
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, providerId: 'openai', model: 'test-model' });
    addApiKey({ providerId: 'openai', label: 'Configured', key: 'configured-key' }, false);
    mocks.requestAi.mockResolvedValue({
      text: 'Hola',
      detectedSourceLanguage: 'en',
      providerId: 'openai',
      model: 'test-model',
      retries: 0,
      inputChars: 5,
      outputChars: 4,
      cached: false,
    });

    renderDialog();
    await user.type(screen.getByLabelText('Text to translate'), 'Hello');
    await user.selectOptions(screen.getByLabelText('To'), 'es');
    await user.click(screen.getByRole('button', { name: 'Translate' }));

    expect(await screen.findByText('Hola')).toBeInTheDocument();
    expect(mocks.requestAi).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'configured-key',
        task: 'translate',
        text: 'Hello',
        targetLanguage: 'Spanish',
        detectSourceLanguage: true,
      }),
    );
    expect(mocks.saveTranslationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: 'Hello',
        translatedText: 'Hola',
        sourceLanguage: 'en',
        targetLanguage: 'es',
      }),
    );
    expect(screen.getByText('Detected: English')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Translate' }).at(-1)!);
    expect(await screen.findByText(/Please wait a moment/)).toBeInTheDocument();
    expect(mocks.requestAi).toHaveBeenCalledOnce();
  });

  it('blocks inputs above 1,000 characters and offers Settings when not configured', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    renderDialog({ onOpenSettings });

    expect(screen.getByText(/Choose an AI provider and model/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Text to translate'), {
      target: { value: 'a'.repeat(1001) },
    });
    expect(screen.getByText(/limited to 1,000 characters/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Translate' }).at(-1)).toBeDisabled();
    expect(mocks.requestAi).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('loads history and supports reuse and deletion', async () => {
    const user = userEvent.setup();
    const entry = {
      id: 'translation-1',
      createdAt: Date.now(),
      sourceText: 'Good morning',
      translatedText: 'မင်္ဂလာနံနက်ခင်းပါ',
      sourceLanguage: 'en',
      targetLanguage: 'my',
    };
    mocks.listTranslationHistory.mockResolvedValue([entry]);
    renderDialog();

    await user.click(screen.getByRole('tab', { name: /History/ }));
    expect(await screen.findByText('Good morning')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reuse' }));
    expect(screen.getByLabelText('Text to translate')).toHaveValue('Good morning');
    expect(screen.getByLabelText('From')).toHaveValue('en');

    await user.click(screen.getByRole('tab', { name: /History/ }));
    await waitFor(() => expect(mocks.listTranslationHistory).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: 'Delete translation' }));
    expect(mocks.deleteTranslationHistoryEntry).toHaveBeenCalledWith('translation-1');
  });
});
