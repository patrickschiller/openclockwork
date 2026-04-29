import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { LoginOutlined, LogoutOutlined, MyLocationOutlined } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ClockInPayload } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';
import { formatDateTime, formatNetMinutes, isOutsideRegularHours } from '../util/format';

export function BookingPage() {
  const { current } = useCurrentEmployee();
  const employeeId = current?.id;
  const queryClient = useQueryClient();
  const [useGps, setUseGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const entriesQuery = useQuery({
    queryKey: ['timeentries', employeeId, 'all'],
    queryFn: () => api.timeEntries(employeeId!),
    enabled: !!employeeId
  });

  const openEntry = entriesQuery.data?.find((e) => e.clockOut === null);

  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('Kein Mitarbeiter ausgewählt.');
      const coords = useGps ? await getCoordinatesAsync() : null;
      const payload: ClockInPayload = {
        employeeId,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        accuracyMeters: coords?.accuracy ?? null
      };
      return api.clockIn(payload);
    },
    onSuccess: () => {
      setFeedback({ kind: 'success', text: 'Eingebucht.' });
      void queryClient.invalidateQueries({ queryKey: ['timeentries', employeeId] });
      void queryClient.invalidateQueries({ queryKey: ['account', employeeId] });
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('Kein Mitarbeiter ausgewählt.');
      return api.clockOut(employeeId);
    },
    onSuccess: () => {
      setFeedback({ kind: 'success', text: 'Ausgebucht.' });
      void queryClient.invalidateQueries({ queryKey: ['timeentries', employeeId] });
      void queryClient.invalidateQueries({ queryKey: ['account', employeeId] });
      void queryClient.invalidateQueries({ queryKey: ['violations', employeeId] });
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  async function getCoordinatesAsync(): Promise<GeolocationCoordinates | null> {
    if (!('geolocation' in navigator)) {
      setGpsError('Gerät stellt keine Geolocation bereit.');
      return null;
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsError(null);
          resolve(pos.coords);
        },
        (err) => {
          setGpsError(`GPS nicht verfügbar (${err.message}). Buchung wird ohne GPS gesendet.`);
          resolve(null);
        },
        { timeout: 8000, enableHighAccuracy: false }
      );
    });
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">Buchen</Typography>
        <Typography variant="body1" color="text.secondary">
          {current ? `${current.firstName} ${current.lastName} (${current.timeModel})` : ''}
        </Typography>
      </Stack>

      {feedback && (
        <Alert severity={feedback.kind} onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}
      {gpsError && <Alert severity="warning">{gpsError}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
              <Typography variant="h4">Status</Typography>
              {openEntry ? (
                <Chip color="success" label={`Eingebucht seit ${formatDateTime(openEntry.clockIn)}`} />
              ) : (
                <Chip variant="outlined" label="Ausgebucht" />
              )}
            </Stack>

            {!openEntry && isOutsideRegularHours(new Date().toISOString()) && (
              <Alert severity="warning">
                Außerhalb 07:00–23:00. Diese Buchung ist genehmigungspflichtig.
              </Alert>
            )}

            <FormControlLabel
              control={<Switch checked={useGps} onChange={(_, c) => setUseGps(c)} />}
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <MyLocationOutlined fontSize="small" />
                  <span>GPS-Standort mitsenden</span>
                </Stack>
              }
            />

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                size="large"
                variant="contained"
                color="success"
                startIcon={<LoginOutlined />}
                disabled={!!openEntry || clockInMutation.isPending}
                onClick={() => clockInMutation.mutate()}
                sx={{ minWidth: 180 }}
              >
                {clockInMutation.isPending ? 'Buche…' : 'Kommen'}
              </Button>
              <Button
                size="large"
                variant="contained"
                color="warning"
                startIcon={<LogoutOutlined />}
                disabled={!openEntry || clockOutMutation.isPending}
                onClick={() => clockOutMutation.mutate()}
                sx={{ minWidth: 180 }}
              >
                {clockOutMutation.isPending ? 'Buche aus…' : 'Gehen'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h4">Letzte Buchungen</Typography>
            {entriesQuery.isLoading && <CircularProgress aria-label="Lade Buchungen" />}
            {entriesQuery.data && entriesQuery.data.length === 0 && (
              <Typography color="text.secondary">Noch keine Buchungen vorhanden.</Typography>
            )}
            {entriesQuery.data && entriesQuery.data.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Beginn</TableCell>
                    <TableCell>Ende</TableCell>
                    <TableCell>Netto</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entriesQuery.data.slice(0, 20).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDateTime(e.clockIn)}</TableCell>
                      <TableCell>{e.clockOut ? formatDateTime(e.clockOut) : '—'}</TableCell>
                      <TableCell>{e.summary ? formatNetMinutes(e.summary.netMinutes) : '—'}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          <Chip size="small" label={e.status} variant="outlined" />
                          {e.requiresApproval && <Chip size="small" color="warning" label="Genehmigung" />}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
