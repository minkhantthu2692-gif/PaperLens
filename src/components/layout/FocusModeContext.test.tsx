import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { FocusModeProvider } from './FocusModeProvider';
import { useFocusMode } from './FocusModeContext';
import { FocusModeExitControl } from './FocusModeExitControl';

function FocusHarness() {
  const {
    isFocusMode,
    setFocusMode,
    fullWorkspaceEnabled,
    setFullWorkspaceEnabled,
    fullscreenError,
  } = useFocusMode();
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => setFocusMode(true)}>
        Enter
      </button>
      <button type="button" onClick={() => setFullWorkspaceEnabled(true)}>
        Enable Full Workspace
      </button>
      <button type="button" onClick={() => navigate('/settings')}>
        Navigate
      </button>
      <output>{isFocusMode ? 'focused' : 'normal'}</output>
      <output>{fullWorkspaceEnabled ? 'enabled' : 'disabled'}</output>
      <output>{fullscreenError ? 'fullscreen-fallback' : 'fullscreen-ready'}</output>
    </>
  );
}

function renderFocusHarness(path = '/workspace/document') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FocusModeProvider>
        <FocusHarness />
      </FocusModeProvider>
    </MemoryRouter>,
  );
}

describe('Focus mode state', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: undefined,
    });
  });

  it('starts disabled and falls back when fullscreen is unavailable', async () => {
    const user = userEvent.setup();
    renderFocusHarness();

    expect(screen.getByText('normal')).toBeInTheDocument();
    expect(screen.getByText('disabled')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(screen.getByText('focused')).toBeInTheDocument();
    expect(await screen.findByText('fullscreen-fallback')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.getByText('normal')).toBeInTheDocument();
  });

  it('requests browser fullscreen from activation and exits it with Escape', async () => {
    const user = userEvent.setup();
    let activeElement: Element | null = null;
    const request = vi.fn(async () => {
      activeElement = document.documentElement;
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => activeElement,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    const exit = vi.fn(async () => {
      activeElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: request,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exit,
    });
    renderFocusHarness();

    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(request).toHaveBeenCalledOnce();
    expect(screen.getByText('focused')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(await screen.findByText('normal')).toBeInTheDocument();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('leaves Full Workspace when browser fullscreen is exited externally', async () => {
    const user = userEvent.setup();
    let activeElement: Element | null = null;
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(async () => {
        activeElement = document.documentElement;
        Object.defineProperty(document, 'fullscreenElement', {
          configurable: true,
          get: () => activeElement,
        });
        document.dispatchEvent(new Event('fullscreenchange'));
      }),
    });
    renderFocusHarness();

    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(screen.getByText('focused')).toBeInTheDocument();

    await act(async () => {
      activeElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    await waitFor(() => expect(screen.getByText('normal')).toBeInTheDocument());
  });

  it('gracefully falls back when the browser denies fullscreen', async () => {
    const user = userEvent.setup();
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(() => Promise.reject(new Error('Fullscreen denied'))),
    });
    renderFocusHarness();

    await user.click(screen.getByRole('button', { name: 'Enter' }));

    expect(await screen.findByText('fullscreen-fallback')).toBeInTheDocument();
    expect(screen.getByText('focused')).toBeInTheDocument();
  });

  it('persists the enable preference without entering fullscreen', async () => {
    const user = userEvent.setup();
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: request,
    });
    renderFocusHarness();

    await user.click(screen.getByRole('button', { name: 'Enable Full Workspace' }));

    expect(screen.getByText('enabled')).toBeInTheDocument();
    expect(localStorage.getItem('paperlens.full-workspace.enabled')).toBe('true');
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText('normal')).toBeInTheDocument();
  });

  it('restores normal mode when navigating away from a workspace', async () => {
    const user = userEvent.setup();
    renderFocusHarness();
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    await user.click(screen.getByRole('button', { name: 'Navigate' }));
    expect(screen.getByText('normal')).toBeInTheDocument();
  });

  it('does not exit while a dialog or menu handles Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/workspace/document']}>
        <FocusModeProvider>
          <FocusHarness />
          <div role="dialog" />
          <div role="menu" />
        </FocusModeProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    await user.keyboard('{Escape}');
    expect(screen.getByText('focused')).toBeInTheDocument();
  });

  it('reveals the floating exit control from every screen edge and auto-hides', () => {
    vi.useFakeTimers();
    render(<FocusModeExitControl onExit={() => undefined} />);
    const exit = screen.getByRole('button', { name: 'Exit Full Workspace' });
    const isVisible = () => exit.className.trim().split(/\s+/).length > 1;

    act(() => vi.advanceTimersByTime(2500));
    expect(isVisible()).toBe(false);
    for (const point of [
      { clientX: 400, clientY: 0 },
      { clientX: 400, clientY: window.innerHeight - 1 },
      { clientX: 0, clientY: 300 },
      { clientX: window.innerWidth - 1, clientY: 300 },
    ]) {
      act(() => {
        window.dispatchEvent(
          Object.assign(new Event('pointermove'), { ...point, pointerType: 'mouse' }),
        );
      });
      expect(isVisible()).toBe(true);
      act(() => {
        window.dispatchEvent(
          Object.assign(new Event('pointermove'), {
            clientX: 400,
            clientY: 300,
            pointerType: 'mouse',
          }),
        );
      });
      act(() => vi.advanceTimersByTime(2500));
      expect(isVisible()).toBe(false);
    }

    act(() => {
      window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 0, clientY: 0 }));
      window.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
    });
    expect(isVisible()).toBe(true);
    act(() => vi.advanceTimersByTime(2500));
    expect(isVisible()).toBe(false);
  });
});
