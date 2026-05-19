import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AppShell } from './AppShell';
import { LoginPage } from '../routes/LoginPage';

// Route-based code-splitting: each page becomes its own Vite chunk so
// the initial bundle only carries the AppShell + Login + the lazy
// loader stub. The service worker prefetches the rest after first paint.
const DashboardPage = lazy(() =>
  import('../routes/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const BookingPage = lazy(() =>
  import('../routes/BookingPage').then((m) => ({ default: m.BookingPage })),
);
const CalendarPage = lazy(() =>
  import('../routes/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const RequestsPage = lazy(() =>
  import('../routes/RequestsPage').then((m) => ({ default: m.RequestsPage })),
);
const SubstitutePage = lazy(() =>
  import('../routes/SubstitutePage').then((m) => ({ default: m.SubstitutePage })),
);
const AbsencesPage = lazy(() =>
  import('../routes/AbsencesPage').then((m) => ({ default: m.AbsencesPage })),
);
const AdminRequestsPage = lazy(() =>
  import('../routes/AdminRequestsPage').then((m) => ({ default: m.AdminRequestsPage })),
);
const AdminSchedulesPage = lazy(() =>
  import('../routes/AdminSchedulesPage').then((m) => ({ default: m.AdminSchedulesPage })),
);
const AdminEmployeesPage = lazy(() =>
  import('../routes/AdminEmployeesPage').then((m) => ({ default: m.AdminEmployeesPage })),
);
const PlaceholderPage = lazy(() =>
  import('../routes/PlaceholderPage').then((m) => ({ default: m.PlaceholderPage })),
);

function RouteFallback() {
  return (
    <div
      className="flex h-64 items-center justify-center text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      Lädt …
    </div>
  );
}

export function App() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="booking" element={<BookingPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="substitute" element={<SubstitutePage />} />
          <Route path="absences" element={<AbsencesPage />} />
          {/* Backwards-compat redirect from the old route name. */}
          <Route path="sickness" element={<Navigate to="/absences" replace />} />
          <Route path="admin/requests" element={<AdminRequestsPage />} />
          <Route path="admin/schedules" element={<AdminSchedulesPage />} />
          <Route path="admin/employees" element={<AdminEmployeesPage />} />
          <Route
            path="*"
            element={<PlaceholderPage title="Nicht gefunden" hint="Diese Seite existiert nicht." />}
          />
        </Route>
        <Route path="login" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
