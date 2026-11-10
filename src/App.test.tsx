import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import i18n from '@/i18n';
import App from '@/App';

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  await i18n.changeLanguage('en');
});

describe('App foundation screen', () => {
  it('renders the foundation status and app version', () => {
    renderApp();

    expect(screen.getByRole('heading', { name: /foundation ready/i })).toBeInTheDocument();
    expect(screen.getByText(/version test/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /your documents stay yours/i })).toBeInTheDocument();
  });

  it('switches the interface language to Burmese', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.selectOptions(screen.getByLabelText(/language/i), 'my');

    expect(
      await screen.findByRole('heading', { name: 'အခြေခံအုတ်မြစ် အသင့်ဖြစ်ပါပြီ' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('my'));
  });

  it('applies a dark theme when selected', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.selectOptions(screen.getByLabelText(/theme/i), 'dark');

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
});
