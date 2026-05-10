import { Route, Routes } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { DashboardPage } from './routes/DashboardPage';
import { BookingPage } from './routes/BookingPage';
import { CalendarPage } from './routes/CalendarPage';
import { RequestsPage } from './routes/RequestsPage';
import { AdminRequestsPage } from './routes/AdminRequestsPage';
import { SubstitutePage } from './routes/SubstitutePage';
import { PlaceholderPage } from './routes/PlaceholderPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="booking" element={<BookingPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="substitute" element={<SubstitutePage />} />
        <Route path="admin/requests" element={<AdminRequestsPage />} />
        <Route
          path="*"
          element={
            <PlaceholderPage
              title="Nicht gefunden"
              hint="Diese Seite existiert nicht."
            />
          }
        />
      </Route>
    </Routes>
  );
}
