import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
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
import { CheckCircleOutline, HighlightOff, HistoryOutlined, ReplayOutlined } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type WorkflowState } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';
import { formatDateTime } from '../util/format';
import { RequestEventsDrawer } from '../components/RequestEventsDrawer';

type FilterMode = 'MyQueue' | 'AllOpen' | 'Approved' | 'Rejected' | 'All';

const FILTERS: { value: FilterMode; label: string }[] = [
  { value: 'MyQueue', label: 'Meine Inbox' },
  { value: 'AllOpen', label: 'Alle offenen' },
  { value: 'Approved', label: 'Genehmigt' },
  { value: 'Rejected', label: 'Abgelehnt' },
  { value: 'All', label: 'Alle' }
];

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

export function AdminRequestsPage() {
  const { current, employees } = useCurrentEmployee();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>('MyQueue');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});
  const [requireHr, setRequireHr] = useState<Record<string, boolean>>({});
  const [eventsRequestId, setEventsRequestId] = useState<string | null>(null);
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState('');

  const canDecide = current?.role === 'Manager' || current?.role === 'HRAdmin';

  const requestsQuery = useQuery({
    queryKey: ['requests', 'admin', filter, current?.id, current?.role],
    queryFn: () => {
      if (!canDecide || !current) return Promise.resolve([]);
      switch (filter) {
        case 'MyQueue':
          return api.listRequests({ currentApproverId: current.id });
        case 'AllOpen':
          return api.listRequests().then((rows) =>
            rows.filter((r) =>
              ['PendingSubstitute', 'PendingManager', 'PendingHr', 'ReturnedForRevision'].includes(
                r.workflowState
              )
            )
          );
        case 'Approved':
          return api.listRequests({ workflowState: 'Approved' });
        case 'Rejected':
          return api.listRequests({ workflowState: 'Rejected' });
        case 'All':
        default:
          return api.listRequests();
      }
    },
    enabled: canDecide
  });

  const employeeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, `${e.firstName} ${e.lastName} (${e.personalNo})`);
    return m;
  }, [employees]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    void queryClient.invalidateQueries({ queryKey: ['vacation-balance'] });
    void queryClient.invalidateQueries({ queryKey: ['account'] });
  };

  const decideMutation = useMutation({
    mutationFn: async (args: { id: string; decision: 'approve' | 'reject'; state: WorkflowState }) => {
      if (!current) throw new Error('Nicht angemeldet.');
      const note = decisionNote[args.id];
      if (args.state === 'PendingHr') {
        return args.decision === 'approve'
          ? api.hrConfirm(args.id, current.id, note)
          : api.hrReject(args.id, current.id, note ?? 'HR-Ablehnung');
      }
      return args.decision === 'approve'
        ? api.managerApprove(args.id, current.id, note, !!requireHr[args.id])
        : api.managerReject(args.id, current.id, note);
    },
    onSuccess: (_, args) => {
      setFeedback({
        kind: 'success',
        text: args.decision === 'approve' ? 'Antrag genehmigt.' : 'Antrag abgelehnt.'
      });
      setDecisionNote((s) => {
        const { [args.id]: _ignored, ...rest } = s;
        return rest;
      });
      setRequireHr((s) => {
        const { [args.id]: _ignored, ...rest } = s;
        return rest;
      });
      invalidate();
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.returnRequest(id, current!.id, note),
    onSuccess: () => {
      setFeedback({ kind: 'success', text: 'Antrag zur Überarbeitung zurückgegeben.' });
      setReturnFor(null);
      setReturnNote('');
      invalidate();
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  if (!canDecide) {
    return (
      <Stack spacing={2}>
        <Typography variant="h1">Genehmigungen</Typography>
        <Alert severity="info">
          Diese Seite ist Vorgesetzten und HR-Admins vorbehalten. Wechsle oben das Profil zu Thomas Schmidt, Sabine
          Weber oder Anna Müller, um die Inbox zu sehen.
        </Alert>
      </Stack>
    );
  }

  const isDecidable = (state: WorkflowState) =>
    state === 'PendingManager' || state === 'PendingHr';

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">Genehmigungen</Typography>
        <Typography variant="body1" color="text.secondary">
          Inbox eingegangener Anträge. „Meine Inbox“ zeigt nur Anträge, die aktuell auf Ihre Entscheidung warten.
        </Typography>
      </Stack>

      {feedback && (
        <Alert severity={feedback.kind} onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <Stack direction="row" spacing={2}>
        <TextField
          select
          size="small"
          label="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          sx={{ minWidth: 200 }}
        >
          {FILTERS.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Card>
        <CardContent>
          {requestsQuery.isLoading && <CircularProgress aria-label="Lade Anträge" />}
          {requestsQuery.data && requestsQuery.data.length === 0 && (
            <Typography color="text.secondary">Keine Anträge in diesem Filter.</Typography>
          )}
          {requestsQuery.data && requestsQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Antragsteller</TableCell>
                  <TableCell>Typ</TableCell>
                  <TableCell>Zeitraum</TableCell>
                  <TableCell>Tage</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Begründung</TableCell>
                  <TableCell>Notiz / Aktion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requestsQuery.data.map((r) => {
                  const decidable = isDecidable(r.workflowState);
                  return (
                    <TableRow
                      key={r.id}
                      sx={{ bgcolor: r.requiresApproval ? 'warning.light' : undefined }}
                    >
                      <TableCell>{employeeMap.get(r.employeeId) ?? r.employeeId}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>
                        {formatDateTime(r.from)}
                        <br />
                        {formatDateTime(r.to)}
                      </TableCell>
                      <TableCell>{r.calculatedDays > 0 ? r.calculatedDays.toFixed(1) : '—'}</TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <Chip
                            size="small"
                            label={WORKFLOW_LABEL[r.workflowState]}
                            color={WORKFLOW_TONE[r.workflowState]}
                          />
                          {r.requiresApproval && <Chip size="small" color="warning" label="Sondergenehmigung" />}
                        </Stack>
                      </TableCell>
                      <TableCell>{r.reason ?? '—'}</TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Verlauf">
                              <IconButton size="small" onClick={() => setEventsRequestId(r.id)}>
                                <HistoryOutlined fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {decidable && (
                              <Tooltip title="Zur Überarbeitung zurückgeben">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setReturnFor(r.id);
                                    setReturnNote('');
                                  }}
                                >
                                  <ReplayOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                          {decidable ? (
                            <>
                              <TextField
                                size="small"
                                placeholder="Notiz (optional)"
                                value={decisionNote[r.id] ?? ''}
                                onChange={(e) =>
                                  setDecisionNote((s) => ({ ...s, [r.id]: e.target.value }))
                                }
                              />
                              {r.workflowState === 'PendingManager' && r.type === 'Vacation' && (
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      size="small"
                                      checked={!!requireHr[r.id]}
                                      onChange={(e) =>
                                        setRequireHr((s) => ({ ...s, [r.id]: e.target.checked }))
                                      }
                                    />
                                  }
                                  label="HR-Bestätigung erforderlich"
                                />
                              )}
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="success"
                                  startIcon={<CheckCircleOutline />}
                                  disabled={decideMutation.isPending}
                                  onClick={() =>
                                    decideMutation.mutate({
                                      id: r.id,
                                      decision: 'approve',
                                      state: r.workflowState
                                    })
                                  }
                                >
                                  Genehmigen
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  startIcon={<HighlightOff />}
                                  disabled={decideMutation.isPending}
                                  onClick={() =>
                                    decideMutation.mutate({
                                      id: r.id,
                                      decision: 'reject',
                                      state: r.workflowState
                                    })
                                  }
                                >
                                  Ablehnen
                                </Button>
                              </Box>
                            </>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              {r.decisionNote ?? '—'}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Box>
        <Typography variant="caption" color="text.secondary">
          Tipp: Klicken Sie auf das Verlaufssymbol, um die vollständige Historie eines Antrags zu sehen.
        </Typography>
      </Box>

      <RequestEventsDrawer requestId={eventsRequestId} onClose={() => setEventsRequestId(null)} />

      <ReturnDialog
        open={!!returnFor}
        note={returnNote}
        onChange={setReturnNote}
        onClose={() => setReturnFor(null)}
        onSubmit={() => returnFor && returnMutation.mutate({ id: returnFor, note: returnNote.trim() })}
        pending={returnMutation.isPending}
      />
    </Stack>
  );
}

interface ReturnDialogProps {
  open: boolean;
  note: string;
  pending: boolean;
  onChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function ReturnDialog({ open, note, pending, onChange, onClose, onSubmit }: ReturnDialogProps) {
  if (!open) return null;
  return (
    <Box
      role="dialog"
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1300
      }}
      onClick={onClose}
    >
      <Card sx={{ width: { xs: '90%', sm: 440 } }} onClick={(e) => e.stopPropagation()}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h4">Zur Überarbeitung zurückgeben</Typography>
            <Typography color="text.secondary">
              Bitte einen kurzen Hinweis hinterlassen, was geändert werden soll.
            </Typography>
            <TextField
              autoFocus
              label="Hinweis"
              multiline
              minRows={2}
              value={note}
              onChange={(e) => onChange(e.target.value)}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={onClose}>Abbrechen</Button>
              <Button
                variant="contained"
                disabled={!note.trim() || pending}
                onClick={onSubmit}
              >
                Zurückgeben
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
