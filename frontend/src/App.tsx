import { Route, Routes } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { DashboardPage } from './routes/DashboardPage';
import { PlaceholderPage } from './routes/PlaceholderPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route
          path="booking"
          element={
            <PlaceholderPage
              title="Kommen / Gehen"
              hint="Mobile Buchungsmaske mit GPS folgt mit AP 3.3."
            />
          }
        />
        <Route
          path="calendar"
          element={
            <PlaceholderPage
              title="Jahreskalender"
              hint="Farbcodierte Status (Urlaub, Home-Office, Krankheit, ...) folgt mit AP 3.5."
            />
          }
        />
        <Route
          path="requests"
          element={
            <PlaceholderPage
              title="Anträge"
              hint="Antragsliste und Formulare (Urlaub, Home-Office, Sonderurlaub, Zeitantrag) folgen mit AP 3.4."
            />
          }
        />
        <Route
          path="admin/requests"
          element={
            <PlaceholderPage
              title="Genehmigungen"
              hint="Vorgesetzten-Inbox mit Filter und Sonder-Approval folgt mit AP 3.7."
            />
          }
        />
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
