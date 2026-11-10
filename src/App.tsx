import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import LibraryPage from '@/pages/LibraryPage';
import NotFoundPage from '@/pages/NotFoundPage';
import SettingsPage from '@/pages/SettingsPage';
import WorkspacePage from '@/pages/WorkspacePage';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter
        basename={basename}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LibraryPage />} />
            <Route path="workspace/:documentId" element={<WorkspacePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
