import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';
import { formatDateTime } from '../util/format';

export function SubstitutePage() {
  const { current } = useCurrentEmployee();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');

  const inboxQuery = useQuery({
    queryKey: ['substitute-inbox', current?.id],
    queryFn: () =>
      api.listRequests({
        substituteId: current!.id,
        workflowState: 'PendingSubstitute'
      }),
    enabled: !!current?.id
  });

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees(),
    enabled: !!current?.id
  });

  const requesterName = (id: string) => {
    const emp = employeesQuery.data?.find((e) => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : id.slice(0, 8);
  };

  const acceptMutation = useMutation({
    mutationFn: (id: string) => api.substituteAccept(id, current!.id),
    onSuccess: () => {
      setFeedback({ kind: 'success', text: 'Vertretung bestätigt – wartet auf Vorgesetzte:n.' });
      void queryClient.invalidateQueries({ queryKey: ['substitute-inbox'] });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  const declineMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.substituteDecline(id, current!.id, note),
    onSuccess: () => {
      setFeedback({ kind: 'success', text: 'Vertretung abgelehnt – Antrag geht zurück an den Mitarbeiter.' });
      setDeclineFor(null);
      setDeclineNote('');
      void queryClient.invalidateQueries({ queryKey: ['substitute-inbox'] });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">Vertretungen</Typography>
        <Typography variant="body1" color="text.secondary">
          Anträge, in denen Sie als Vertretung benannt sind.
        </Typography>
      </Stack>

      {feedback && (
        <Alert severity={feedback.kind} onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <Card>
        <CardContent>
          {inboxQuery.isLoading && <CircularProgress aria-label="Lade Vertretungen" />}

          {inboxQuery.data && inboxQuery.data.length === 0 && (
            <Typography color="text.secondary">
              Aktuell keine offenen Vertretungs-Anfragen.
            </Typography>
          )}

          {inboxQuery.data && inboxQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Antragsteller</TableCell>
                  <TableCell>Von</TableCell>
                  <TableCell>Bis</TableCell>
                  <TableCell>Tage</TableCell>
                  <TableCell>Begründung</TableCell>
                  <TableCell align="right">Aktion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {inboxQuery.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{requesterName(r.employeeId)}</TableCell>
                    <TableCell>{formatDateTime(r.from)}</TableCell>
                    <TableCell>{formatDateTime(r.to)}</TableCell>
                    <TableCell>{r.calculatedDays.toFixed(1)}</TableCell>
                    <TableCell>{r.reason ?? '—'}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          disabled={acceptMutation.isPending}
                          onClick={() => acceptMutation.mutate(r.id)}
                        >
                          Bestätigen
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => {
                            setDeclineFor(r.id);
                            setDeclineNote('');
                          }}
                        >
                          Ablehnen
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!declineFor} onClose={() => setDeclineFor(null)} fullWidth maxWidth="sm">
        <DialogTitle>Vertretung ablehnen</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography color="text.secondary">
              Bitte einen kurzen Hinweis hinterlassen – der Antrag geht damit zurück an den Antragsteller.
            </Typography>
            <TextField
              autoFocus
              label="Grund"
              multiline
              minRows={2}
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeclineFor(null)}>Abbrechen</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!declineNote.trim() || declineMutation.isPending}
            onClick={() => declineFor && declineMutation.mutate({ id: declineFor, note: declineNote.trim() })}
          >
            Ablehnen
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
