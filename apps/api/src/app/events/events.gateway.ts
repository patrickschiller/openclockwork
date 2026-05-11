import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload, JwtUser } from '../auth/jwt.strategy';

/**
 * Realtime events fanout. The HTTP API is the source of truth — sockets
 * only invalidate caches on the client.
 *
 * Authentication: every connecting client must present a valid JWT in
 * `handshake.auth.token` (preferred) or as `Authorization: Bearer …`
 * (fallback for transports that don't carry custom auth payloads).
 * Connections without a valid token are rejected immediately.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket): void {
    const token = extractToken(client);
    if (!token) {
      this.logger.warn(`socket ${client.id} rejected: no token`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      const user: JwtUser = { id: payload.sub, email: payload.email, role: payload.role };
      (client.data as { user: JwtUser }).user = user;
      this.logger.log(`socket connected: ${client.id} (${user.email})`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'invalid token';
      this.logger.warn(`socket ${client.id} rejected: ${reason}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user = (client.data as { user?: JwtUser }).user;
    this.logger.log(`socket disconnected: ${client.id}${user ? ` (${user.email})` : ''}`);
  }

  broadcast<T>(event: string, payload: T): void {
    if (!this.server) return;
    this.server.emit(event, payload);
  }
}

function extractToken(client: Socket): string | null {
  const auth = client.handshake.auth as { token?: unknown } | undefined;
  if (auth && typeof auth.token === 'string' && auth.token.length > 0) {
    return auth.token;
  }
  const headers = client.handshake.headers ?? {};
  const raw = headers['authorization'] ?? headers['Authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.toLowerCase().startsWith('bearer ')) {
    return value.slice(7).trim() || null;
  }
  return null;
}
