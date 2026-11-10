import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { CleanupDialog } from './CleanupDialog';

function renderDialog(sourceText: string, onApply = vi.fn(), onClose = vi.fn()) {
  return render(
    <CleanupDialog
      open
      sourceText={sourceText}
      scope="document"
      onClose={onClose}
      onApply={onApply}
    />,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('CleanupDialog', () => {
  it('applies the selected deterministic cleanups', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderDialog('Head  line\nA docu-\nment', onApply, onClose);

    await user.click(screen.getByRole('button', { name: 'Apply changes' }));

    expect(onApply).toHaveBeenCalledWith('Head line A document');
    expect(onClose).toHaveBeenCalled();
  });

  it('disables applying when nothing would change', () => {
    renderDialog('Simple text.');
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  });

  it('shows an empty state and blocks applying for empty text', () => {
    renderDialog('   ');
    expect(screen.getByText(/There is no text to clean up/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  });
});
