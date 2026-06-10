import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { TOKEN_STORAGE_KEY } from '../api/client';
import { useAuth } from './auth';

// socket.io-client is heavy and only needed after the user has
// authenticated, so it gets loaded behind a dynamic import. That keeps
// the initial (unauthenticated) bundle lean for Lighthouse runs against
// the public landing page.

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

async function ensureSocket(token: string): Promise<Socket> {
  if (sharedSocket && sharedToken === token) return sharedSocket;
  disposeSocket();
  const { io } = await import('socket.io-client');
  sharedToken = token;
  sharedSocket = io({
    // websocket only — ACA terminates TLS and supports WS natively; the
    // polling fallback transport adds noticeable bytes without value.
    transports: ['websocket'],
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
    if (!user) {
      disposeSocket();
      return;
    }
    const token = readToken();
    if (!token) return;

    let cancelled = false;
    let detach: (() => void) | undefined;

    ensureSocket(token).then((socket) => {
      if (cancelled) return;

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
      const onProject = () => {
        qc.invalidateQueries({ queryKey: ['projects'] });
        qc.invalidateQueries({ queryKey: ['project-assignments'] });
        qc.invalidateQueries({ queryKey: ['bookable-projects'] });
      };
      socket.on('request:transitioned', onTransition);
      socket.on('time-entry:created', onTimeEntry);
      socket.on('time-entry:updated', onTimeEntry);
      socket.on('project:changed', onProject);
      detach = () => {
        socket.off('request:transitioned', onTransition);
        socket.off('time-entry:created', onTimeEntry);
        socket.off('time-entry:updated', onTimeEntry);
        socket.off('project:changed', onProject);
      };
    });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [qc, user]);
}
