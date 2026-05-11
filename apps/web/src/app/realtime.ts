import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({ transports: ['websocket', 'polling'] });
  }
  return sharedSocket;
}

export function useRealtimeInvalidation() {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
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
  }, [qc]);
}
