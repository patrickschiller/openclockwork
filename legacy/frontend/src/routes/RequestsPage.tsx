import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { AddOutlined, CancelOutlined, HistoryOutlined } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RequestType, type WorkflowState } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';
import { formatDateTime, isOutsideRegularHours } from '../util/format';
import { RequestEventsDrawer } from '../components/RequestEventsDrawer';

const REQUEST_TYPES: { value: RequestType; label: string; description: string }[] = [
  { value: 'Vacation', label: 'Urlaub', description: 'Mehrere Tage – ganztägig.' },
  { value: 'HomeOffice', label: 'Home-Office', description: 'Tag(e) im Home-Office.' },
  { value: 'SpecialLeave', label: 'Sonderurlaub', description: 'Hochzeit, Umzug, Trauerfall…' },
  { value: 'TimeCorrection', label: 'Zeitkorrektur', description: 'Manuelle Buchungskorrektur.' }
];

const WORKFLOW_TONE: Record<WorkflowState, 'default' | 'success' | 'error' | 'info' | 'warning'> = {
  Draft: 'default',
  Submitted: 'info',
  PendingSubstitute: 'info',
  PendingManager: 'info',
  PendingHr: 'warning',
  Approved: 'success',
  Rejected: 'error',
  ReturnedForRevision: 'warning',
  Cancelled: 'default'
};

const WORKFLOW_LABEL: Record<WorkflowState, string> = {
  Draft: 'Entwurf',
  Submitted: 'Eingereicht',
  PendingSubstitute: 'Wartet auf Vertretung',
  PendingManager: 'Wartet auf Vorgesetzte:n',
  PendingHr: 'Wartet auf HR',
  Approved: 'Genehmigt',
  Rejected: 'Abgelehnt',
  ReturnedForRevision: 'Zur Überarbeitung',
  Cancelled: 'Storniert'
};

interface FormState {
  type: RequestType;
  from: string;
  to: string;
  reason: string;
  substituteId: string;
}

function emptyForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return { type: 'Vacation', from: `${today}T09:00`, to: `${today}T17:00`, reason: '', substituteId: '' };
}

export function RequestsPage() {
  const { current } = useCurrentEmployee();
  const employeeId = current?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [eventsRequestId, setEventsRequestId] = useState<string | null>(null);

  const requestsQuery = useQuery({
    queryKey: ['requests', 'mine', employeeId],
    queryFn: () => api.listRequests({ employeeId }),
    enabled: !!employeeId
  });

  const balanceQuery = useQuery({
    queryKey: ['vacation-balance', employeeId, new Date(form.from).getFullYear()],
    queryFn: () => api.vacationBalance(employeeId!, new Date(form.from).getFullYear()),
    enabled: !!employeeId && form.type === 'Vacation'
  });

  const colleaguesQuery = useQuery({
    queryKey: ['employees', 'colleagues'],
    queryFn: () => api.employees(),
    enabled: form.type === 'Vacation'
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!employeeId) throw new Error('Kein Mitarbeiter ausgewählt.');
      const fromIso = new Date(form.from).toISOString();
      const toIso = new Date(form.to).toISOString();
      if (form.type === 'Vacation') {
        return api.createVacationRequest({
          employeeId,
          from: fromIso,
          to: toIso,
          substituteId: form.substituteId || null,
          reason: form.reason || null
        });
      }
      return api.createRequest({
        employeeId,
        type: form.type,
        from: fromIso,
        to: toIso,
        reason: form.reason || null
      });
    },
    onSuccess: () => {
      setFeedback({ kind: 'success', text: 'Antrag eingereicht.' });
      setDialogOpen(false);
      setForm(emptyForm());
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['vacation-balance'] });
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => {
      if (!employeeId) throw new Error('Kein Mitarbeiter ausgewählt.');
      return api.cancelRequest(id, employeeId, 'Vom Antragsteller storniert');
    },
    onSuccess: () => {
      setFeedback({ kind: 'success', text: 'Antrag storniert.' });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['vacation-balance'] });
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  const showSpecialApprovalWarning = useMemo(() => {
    if (form.type !== 'TimeCorrection') return false;
    if (!form.from || !form.to) return false;
    return (
      isOutsideRegularHours(new Date(form.from).toISOString()) ||
      isOutsideRegularHours(new Date(form.to).toISOString())
    );
  }, [form]);

  const requestedDays = useMemo(() => {
    if (form.type !== 'Vacation' || !form.from || !form.to) return 0;
    const from = new Date(form.from);
    const to = new Date(form.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return 0;
    let days = 0;
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) days += 1;
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [form]);

  const insufficient =
    form.type === 'Vacation' && balanceQuery.data ? requestedDays > balanceQuery.data.remainingDays : false;

  const colleagues = (colleaguesQuery.data ?? []).filter((c) => c.id !== employeeId && c.isActive);

  const canCancel = (state: WorkflowState) =>
    state !== 'Approved' && state !== 'Rejected' && state !== 'Cancelled';

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Stack spacing={1}>
          <Typography variant="h1">Anträge</Typography>
          <Typography variant="body1" color="text.secondary">
            Urlaub, Home-Office, Sonderurlaub und Zeitkorrekturen.
          </Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setDialogOpen(true)}>
          Neuer Antrag
        </Button>
      </Stack>

      {feedback && (
        <Alert severity={feedback.kind} onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h4">Meine Anträge</Typography>
            {requestsQuery.isLoading && <CircularProgress aria-label="Lade Anträge" />}
            {requestsQuery.data && requestsQuery.data.length === 0 && (
              <Typography color="text.secondary">Noch keine Anträge gestellt.</Typography>
            )}
            {requestsQuery.data && requestsQuery.data.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Typ</TableCell>
                    <TableCell>Von</TableCell>
                    <TableCell>Bis</TableCell>
                    <TableCell>Tage</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Begründung</TableCell>
                    <TableCell align="right">Aktion</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requestsQuery.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>{formatDateTime(r.from)}</TableCell>
                      <TableCell>{formatDateTime(r.to)}</TableCell>
                      <TableCell>{r.calculatedDays > 0 ? r.calculatedDays.toFixed(1) : '—'}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          <Chip
                            size="small"
                            label={WORKFLOW_LABEL[r.workflowState]}
                            color={WORKFLOW_TONE[r.workflowState]}
                          />
                          {r.requiresApproval && <Chip size="small" color="warning" label="Sondergenehmigung" />}
                        </Stack>
                      </TableCell>
                      <TableCell>{r.reason ?? '—'}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Verlauf">
                          <IconButton size="small" onClick={() => setEventsRequestId(r.id)}>
                            <HistoryOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canCancel(r.workflowState) && (
                          <Tooltip title="Stornieren">
                            <IconButton
                              size="small"
                              onClick={() => cancelMutation.mutate({ id: r.id })}
                              disabled={cancelMutation.isPending}
                            >
                              <CancelOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Neuer Antrag</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Typ"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as RequestType })}
              helperText={REQUEST_TYPES.find((t) => t.value === form.type)?.description}
            >
              {REQUEST_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="datetime-local"
              label="Von"
              InputLabelProps={{ shrink: true }}
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
            <TextField
              type="datetime-local"
              label="Bis"
              InputLabelProps={{ shrink: true }}
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
            <TextField
              label="Begründung (optional)"
              multiline
              minRows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />

            {form.type === 'Vacation' && (
              <>
                <TextField
                  select
                  label="Vertretung (optional)"
                  value={form.substituteId}
                  onChange={(e) => setForm({ ...form, substituteId: e.target.value })}
                  helperText="Wenn gewählt, muss die Vertretung den Antrag bestätigen, bevor die/der Vorgesetzte entscheidet."
                >
                  <MenuItem value="">Keine</MenuItem>
                  {colleagues.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </MenuItem>
                  ))}
                </TextField>
                {balanceQuery.data && (
                  <Alert severity={insufficient ? 'error' : 'info'}>
                    {`Resturlaub ${balanceQuery.data.year}: ${balanceQuery.data.remainingDays.toFixed(1)} Tage. Beantragt: ${requestedDays.toFixed(1)} Tag(e). `}
                    {insufficient && 'Nicht genügend Resttage – bitte Zeitraum anpassen.'}
                  </Alert>
                )}
              </>
            )}

            {showSpecialApprovalWarning && (
              <Alert severity="warning">
                Diese Zeitkorrektur fällt vor 07:00 oder nach 23:00 und ist sondergenehmigungspflichtig.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Abbrechen</Button>
          <Button
            variant="contained"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || insufficient}
          >
            {createMutation.isPending ? 'Sende…' : 'Einreichen'}
          </Button>
        </DialogActions>
      </Dialog>

      <RequestEventsDrawer requestId={eventsRequestId} onClose={() => setEventsRequestId(null)} />
    </Stack>
  );
}
