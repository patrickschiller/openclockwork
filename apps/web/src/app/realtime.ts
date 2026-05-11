import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { TOKEN_STORAGE_KEY } from '../api/client';
import { useAuth } from './auth';

let sharedSocket: Socket | null = null;
let sharedToken: string | null = null;

function disposeSocket(): void {
  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
    sharedToken = null;
  }
}

function ensureSocket(token: string | null): Socket | null {
  if (!token) {
    disposeSocket();
    return null;
  }
  if (sharedSocket && sharedToken === token) return sharedSocket;
  disposeSocket();
  sharedToken = token;
  sharedSocket = io({
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
  });
  return sharedSocket;
}

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useRealtimeInvalidation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    const token = user ? readToken() : null;
    const socket = ensureSocket(token);
    if (!socket) return;

    const onTransition = () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['vacation-balance'] });
      qc.invalidateQueries({ queryKey: ['account'] });
    };
    const onTimeEntry = () => {
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['account'] });
      qc.invalidateQueries({ queryKey: ['violations'] });
    };
    socket.on('request:transitioned', onTransition);
    socket.on('time-entry:created', onTimeEntry);
    socket.on('time-entry:updated', onTimeEntry);
    return () => {
      socket.off('request:transitioned', onTransition);
      socket.off('time-entry:created', onTimeEntry);
      socket.off('time-entry:updated', onTimeEntry);
    };
  }, [qc, user]);
}
