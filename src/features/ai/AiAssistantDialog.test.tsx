import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { AiError } from '@/services/ai/client';
import { addApiKey } from '@/services/ai/keys';
import { loadAiSettings, saveAiSettings } from '@/services/ai/settings';
import { DEFAULT_AI_SETTINGS, type AiAssistantPreferences } from '@/services/ai/types';
import { AiAssistantDialog } from './AiAssistantDialog';

const aiMocks = vi.hoisted(() => ({
  requestAi: vi.fn(),
  saveAiHistory: vi.fn(),
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

vi.mock('@/services/ai/history', () => ({
  saveAiHistory: aiMocks.saveAiHistory,
}));

function configure(preferences: Partial<AiAssistantPreferences> = {}) {
  saveAiSettings({
    ...DEFAULT_AI_SETTINGS,
    providerId: 'openai',
    model: 'test-model',
    assistant: { ...DEFAULT_AI_SETTINGS.assistant, ...preferences },
  });
  addApiKey({ providerId: 'openai', label: 'Test', key: 'test-key' }, false);
}

function mockResponse(text: string) {
  return {
    text,
    providerId: 'openai',
    model: 'test-model',
    retries: 0,
    inputChars: 17,
    outputChars: text.length,
    cached: false,
  };
}

function renderDialog(
  initialText = 'Selected paragraph',
  handlers: {
    onApply?: (text: string, mode: 'insert' | 'append') => void;
    onUndo?: () => void;
    onClose?: () => void;
    onOpenSettings?: () => void;
  } = {},
) {
  return render(
    <AiAssistantDialog
      open
      initialText={initialText}
      onApply={handlers.onApply ?? vi.fn()}
      onUndo={handlers.onUndo ?? vi.fn()}
      onClose={handlers.onClose ?? vi.fn()}
      onOpenSettings={handlers.onOpenSettings ?? vi.fn()}
    />,
  );
}

beforeEach(async () => {
  aiMocks.requestAi.mockReset();
  aiMocks.saveAiHistory.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  await i18n.changeLanguage('en');
});

describe('AiAssistantDialog', () => {
  it('opens with editable selected text and a live character counter', async () => {
    const user = userEvent.setup();
    configure();
    aiMocks.requestAi.mockResolvedValue(mockResponse('Improved text'));

    renderDialog('Selected paragraph');

    const input = screen.getByLabelText('Text to process');
    expect(input).toHaveValue('Selected paragraph');
    expect(screen.getByText('18 / 6000 characters')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Improved text')).toBeInTheDocument();
    expect(aiMocks.requestAi).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'proofread', text: 'Selected paragraph' }),
    );
  });

  it('sends manually typed text and blocks empty input', async () => {
    const user = userEvent.setup();
    configure();
    aiMocks.requestAi.mockResolvedValue(mockResponse('Typed result'));

    renderDialog('Selected paragraph');

    const input = screen.getByLabelText('Text to process');
    await user.click(screen.getByRole('button', { name: 'Clear text' }));
    expect(input).toHaveValue('');
    expect(screen.getByText('0 / 6000 characters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();

    await user.type(input, 'Typed paragraph');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('Typed result')).toBeInTheDocument();
    expect(aiMocks.requestAi).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Typed paragraph' }),
    );
  });

  it('keeps large pasted text intact and blocks requests over the limit', () => {
    saveAiSettings({
      ...DEFAULT_AI_SETTINGS,
      providerId: 'openai',
      model: 'test-model',
      guardrails: { ...DEFAULT_AI_SETTINGS.guardrails, maxInputChars: 500 },
    });
    addApiKey({ providerId: 'openai', label: 'Test', key: 'test-key' }, false);

    renderDialog('');

    const input = screen.getByLabelText('Text to process');
    const pasted = 'a'.repeat(650);
    fireEvent.change(input, { target: { value: pasted } });

    expect(input).toHaveValue(pasted);
    expect((input as HTMLTextAreaElement).value).toHaveLength(650);
    expect(screen.getByText('650 / 500 characters')).toBeInTheDocument();
    expect(screen.getByText(/150 characters over the limit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(aiMocks.requestAi).not.toHaveBeenCalled();
  });

  it('offers only the simplified categories and actions without translation', async () => {
    const user = userEvent.setup();
    configure();

    renderDialog();

    expect(screen.queryByRole('tab', { name: 'Translate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Translate' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Translate to')).not.toBeInTheDocument();

    const improvePanel = screen.getByRole('tabpanel', { name: 'Improve' });
    expect(within(improvePanel).getByRole('button', { name: 'Proofread' })).toBeInTheDocument();
    expect(within(improvePanel).getByRole('button', { name: 'Rewrite' })).toBeInTheDocument();
    expect(
      within(improvePanel).getByRole('button', { name: 'Clean OCR text' }),
    ).toBeInTheDocument();
    expect(within(improvePanel).getByRole('button', { name: 'Simplify' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Process' }));
    const processPanel = screen.getByRole('tabpanel', { name: 'Process' });
    expect(within(processPanel).getByRole('button', { name: 'Summarize' })).toBeInTheDocument();
    expect(
      within(processPanel).getByRole('button', { name: 'Extract key points' }),
    ).toBeInTheDocument();
    expect(
      within(processPanel).getByRole('button', { name: 'Convert to bullet points' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Academic' }));
    const academicPanel = screen.getByRole('tabpanel', { name: 'Academic' });
    expect(
      within(academicPanel).getByRole('button', { name: 'Academic writing' }),
    ).toBeInTheDocument();
    expect(
      within(academicPanel).getByRole('button', { name: 'Improve academic tone' }),
    ).toBeInTheDocument();
    expect(within(academicPanel).getByRole('button', { name: 'Explain' })).toBeInTheDocument();
  });

  it('runs the bullet, academic tone, and explain actions with the right task', async () => {
    const user = userEvent.setup();
    configure();
    aiMocks.requestAi
      .mockResolvedValueOnce(mockResponse('Bullet result'))
      .mockResolvedValueOnce(mockResponse('Tone result'))
      .mockResolvedValueOnce(mockResponse('Explain result'));

    renderDialog();

    await user.click(screen.getByRole('tab', { name: 'Process' }));
    await user.click(
      within(screen.getByRole('tabpanel', { name: 'Process' })).getByRole('button', {
        name: 'Convert to bullet points',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Bullet result')).toBeInTheDocument();
    expect(aiMocks.requestAi).toHaveBeenLastCalledWith(
      expect.objectContaining({ task: 'bullets' }),
    );

    await user.click(screen.getByRole('tab', { name: 'Academic' }));
    const academicPanel = screen.getByRole('tabpanel', { name: 'Academic' });
    await user.click(within(academicPanel).getByRole('button', { name: 'Improve academic tone' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Tone result')).toBeInTheDocument();
    expect(aiMocks.requestAi).toHaveBeenLastCalledWith(
      expect.objectContaining({ task: 'academic-tone' }),
    );

    await user.click(within(academicPanel).getByRole('button', { name: 'Explain' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Explain result')).toBeInTheDocument();
    expect(aiMocks.requestAi).toHaveBeenLastCalledWith(
      expect.objectContaining({ task: 'explain' }),
    );
  });

  it('shows the comparison and inserts the result into the editor with undo', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onUndo = vi.fn();
    configure();
    aiMocks.requestAi.mockResolvedValue(mockResponse('Improved text'));

    renderDialog('Selected paragraph', { onApply, onUndo });

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Improved text')).toBeInTheDocument();
    expect(screen.getByText('Original text')).toBeInTheDocument();
    expect(screen.getByText('Generated text')).toBeInTheDocument();
    expect(screen.getAllByText('Selected paragraph').length).toBeGreaterThan(1);

    await user.click(screen.getByRole('button', { name: 'Insert into editor' }));
    expect(onApply).toHaveBeenCalledWith('Improved text', 'insert');
    expect(screen.getByText(/Inserted the result at the editor position/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('appends the result below the document content', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    configure();
    aiMocks.requestAi.mockResolvedValue(mockResponse('Appended text'));

    renderDialog('Page text', { onApply });

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.click(await screen.findByRole('button', { name: 'Append below in editor' }));

    expect(onApply).toHaveBeenCalledWith('Appended text', 'append');
    expect(screen.getByText(/Appended the result below the document content/)).toBeInTheDocument();
  });

  it('regenerates a result and clears stale output when the action changes', async () => {
    const user = userEvent.setup();
    configure();
    aiMocks.requestAi
      .mockResolvedValueOnce(mockResponse('First result'))
      .mockResolvedValueOnce(mockResponse('Second result'));

    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('First result')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate again' }));
    expect(await screen.findByText('Second result')).toBeInTheDocument();
    expect(screen.queryByText('First result')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Process' }));
    await user.click(
      within(screen.getByRole('tabpanel', { name: 'Process' })).getByRole('button', {
        name: 'Summarize',
      }),
    );
    expect(screen.queryByText('Second result')).not.toBeInTheDocument();
  });

  it('applies temporary overrides without changing saved settings', async () => {
    const user = userEvent.setup();
    configure();
    aiMocks.requestAi.mockResolvedValue(mockResponse('Result'));

    renderDialog();

    await user.click(screen.getByText('Advanced options'));
    await user.selectOptions(screen.getByLabelText('Tone'), 'academic');
    await user.selectOptions(screen.getByLabelText('Length'), 'detailed');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(aiMocks.requestAi).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ tone: 'academic', outputLength: 'detailed' }),
      }),
    );
    expect(loadAiSettings().assistant.tone).toBe('professional');
    expect(loadAiSettings().assistant.outputLength).toBe('balanced');
  });

  it('requires a custom instruction and runs saved presets', async () => {
    const user = userEvent.setup();
    configure({
      presets: [
        { id: 'preset-1', name: 'Newsletter', instruction: 'Rewrite this as a newsletter item.' },
      ],
    });
    aiMocks.requestAi.mockResolvedValue(mockResponse('Preset result'));

    renderDialog();

    await user.click(screen.getByRole('tab', { name: 'Custom' }));
    const panel = screen.getByRole('tabpanel', { name: 'Custom' });
    await user.click(within(panel).getByRole('button', { name: 'Custom instruction' }));

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText(/Enter a custom instruction/)).toBeInTheDocument();
    expect(aiMocks.requestAi).not.toHaveBeenCalled();

    await user.click(within(panel).getByRole('button', { name: 'Newsletter' }));
    expect(screen.getByLabelText('Custom instruction')).toHaveValue(
      'Rewrite this as a newsletter item.',
    );
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('Preset result')).toBeInTheDocument();
    expect(aiMocks.requestAi).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'custom',
        options: expect.objectContaining({
          customInstruction: 'Rewrite this as a newsletter item.',
        }),
      }),
    );
  });

  it('saves results to history only when history is enabled', async () => {
    const user = userEvent.setup();
    configure({ historyEnabled: true });
    aiMocks.requestAi.mockResolvedValue(mockResponse('Saved result'));

    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Saved result')).toBeInTheDocument();
    expect(aiMocks.saveAiHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'proofread',
        task: 'proofread',
        sourceText: 'Selected paragraph',
        resultText: 'Saved result',
      }),
    );
  });

  it('shows configuration guidance when no key is stored', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    renderDialog('Selected paragraph', { onOpenSettings });

    expect(screen.getByText(/Add a provider, model, and API key/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open AI settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('cancels a running request without producing a result', async () => {
    const user = userEvent.setup();
    configure();
    aiMocks.requestAi.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new AiError('cancelled')));
        }),
    );

    renderDialog('Selected paragraph');

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }));

    expect(await screen.findByText('The request was cancelled.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Insert into editor' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Text to process')).toBeEnabled();
  });

  it('surfaces provider errors without applying anything', async () => {
    const user = userEvent.setup();
    configure();
    aiMocks.requestAi.mockRejectedValue(new AiError('auth'));

    renderDialog('Selected paragraph');

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText(/The provider rejected the API key/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Insert into editor' })).not.toBeInTheDocument();
  });
});
