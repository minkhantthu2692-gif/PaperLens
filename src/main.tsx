import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import '@/i18n';
import '@/styles/base.css';
import App from '@/App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('PaperLens could not start: #root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
