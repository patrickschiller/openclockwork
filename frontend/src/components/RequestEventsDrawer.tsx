import {
  CircularProgress,
  Drawer,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import { CloseOutlined } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { api, type RequestEventKind } from '../api/client';
import { formatDateTime } from '../util/format';

const KIND_LABEL: Record<RequestEventKind, string> = {
  Submitted: 'Eingereicht',
  SubstituteAccepted: 'Vertretung bestätigt',
  SubstituteDeclined: 'Vertretung abgelehnt',
  ManagerApproved: 'Vorgesetzte:r genehmigt',
  ManagerRejected: 'Vorgesetzte:r abgelehnt',
  HrConfirmed: 'HR bestätigt',
  HrRejected: 'HR abgelehnt',
  ReturnedForRevision: 'Zur Überarbeitung',
  Cancelled: 'Storniert',
  Resubmitted: 'Erneut eingereicht'
};

interface Props {
  requestId: string | null;
  onClose: () => void;
}

export function RequestEventsDrawer({ requestId, onClose }: Props) {
  const eventsQuery = useQuery({
    queryKey: ['request-events', requestId],
    queryFn: () => api.getRequestEvents(requestId!),
    enabled: !!requestId
  });

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees(),
    enabled: !!requestId
  });

  const employeeName = (id: string) => {
    const emp = employeesQuery.data?.find((e) => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : id.slice(0, 8);
  };

  return (
    <Drawer anchor="right" open={!!requestId} onClose={onClose}>
      <Stack sx={{ width: { xs: '100%', sm: 420 }, p: 3 }} spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h4">Verlauf</Typography>
          <IconButton onClick={onClose} aria-label="Schließen">
            <CloseOutlined />
          </IconButton>
        </Stack>

        {eventsQuery.isLoading && <CircularProgress aria-label="Lade Verlauf" />}

        {eventsQuery.data && eventsQuery.data.length === 0 && (
          <Typography color="text.secondary">Keine Ereignisse vorhanden.</Typography>
        )}

        <Stack spacing={1.5}>
          {eventsQuery.data?.map((ev) => (
            <Stack
              key={ev.id}
              spacing={0.25}
              sx={{ borderLeft: 3, borderColor: 'primary.main', pl: 1.5 }}
            >
              <Typography variant="subtitle2">{KIND_LABEL[ev.kind]}</Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDateTime(ev.at)} · {employeeName(ev.actorId)}
              </Typography>
              {ev.note && <Typography variant="body2">{ev.note}</Typography>}
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Drawer>
  );
}
