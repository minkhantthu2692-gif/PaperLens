import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import i18n from '@/i18n';
import App from '@/App';

function renderApp(path = '/') {
  window.history.pushState({}, '', path);
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

describe('App routing', () => {
  it('renders the document library at the root route', async () => {
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument();
  });

  it('opens settings and applies a dark theme', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Theme'), 'dark');

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  it('switches the interface language to Burmese', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    await user.selectOptions(await screen.findByLabelText('Language'), 'my');

    expect(await screen.findByRole('heading', { name: 'ဆက်တင်များ' })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('my'));
  });

  it('shows a not-found page for unknown routes', async () => {
    renderApp('/missing-page');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
