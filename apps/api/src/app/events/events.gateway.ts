import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload, JwtUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { InstallationService } from '../installation/installation.service';

interface AuthorizedSocket {
  client: Socket;
  employeeId: string;
  authVersion: number;
  expiresAt: number;
  expiryTimer: ReturnType<typeof setTimeout>;
}

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
  private readonly connections = new Map<string, AuthorizedSocket>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly installation: InstallationService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = extractToken(client);
    if (!token) {
      this.logger.warn(`socket ${client.id} rejected: no token`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify<JwtPayload & { exp?: number }>(token);
      // Pre-typ access tokens remain compatible, exactly as in JwtStrategy.
      if (
        !payload.sub ||
        (payload.typ && payload.typ !== 'access') ||
        !Number.isFinite(payload.exp)
      ) {
        throw new Error('Invalid access token');
      }
      const employee = await this.prisma.employee.findUnique({
        where: { id: payload.sub },
      });
      if (!employee?.isActive || employee.authVersion !== (payload.ver ?? 0))
        throw new Error('Session no longer valid');
      await this.installation.assertActorAccess(employee.id);
      if (await this.installation.isSolo())
        await this.installation.requireOwner(employee.id);
      const expiresAt = (payload.exp as number) * 1000;
      if (expiresAt <= Date.now() || !client.connected) {
        client.disconnect(true);
        return;
      }
      const user: JwtUser = {
        id: employee.id,
        email: employee.email,
        role: employee.role,
      };
      (client.data as { user: JwtUser }).user = user;
      const expiryTimer = setTimeout(
        () => this.disconnect(client),
        Math.min(expiresAt - Date.now(), 2_147_483_647),
      );
      expiryTimer.unref();
      this.connections.set(client.id, {
        client,
        employeeId: employee.id,
        authVersion: employee.authVersion,
        expiresAt,
        expiryTimer,
      });
      this.logger.log(`socket connected: ${client.id}`);
    } catch {
      this.logger.warn(
        `socket ${client.id} rejected: invalid or unauthorized session`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const connection = this.connections.get(client.id);
    if (connection) clearTimeout(connection.expiryTimer);
    this.connections.delete(client.id);
    this.logger.log(`socket disconnected: ${client.id}`);
  }

  async broadcast<T>(event: string, payload: T): Promise<void> {
    if (!this.server) return;
    // Never fan out via server.emit: it includes sockets whose async handshake
    // has not passed authorization yet and sessions invalidated after connect.
    const recipients = await this.revalidateConnections();
    for (const client of recipients) {
      const ownerId = (client.data as { soloOwnerId?: string | null })
        .soloOwnerId;
      const subject =
        typeof payload === 'object' &&
        payload !== null &&
        'employeeId' in payload
          ? payload.employeeId
          : undefined;
      if (ownerId && subject !== undefined && subject !== ownerId) continue;
      if (client.connected) client.emit(event, payload);
    }
  }

  /** Also callable after an identity/mode change to disconnect immediately. */
  async revalidateConnections(): Promise<Socket[]> {
    const connections = [...this.connections.values()];
    if (!connections.length) return [];
    try {
      const [settings, employees] = await Promise.all([
        this.installation.getSettings(),
        this.prisma.employee.findMany({
          where: {
            id: {
              in: [
                ...new Set(
                  connections.map((connection) => connection.employeeId),
                ),
              ],
            },
          },
          select: {
            id: true,
            isActive: true,
            authVersion: true,
            email: true,
            role: true,
          },
        }),
      ]);
      const byId = new Map(
        employees.map((employee) => [employee.id, employee]),
      );
      const recipients: Socket[] = [];
      for (const connection of connections) {
        const employee = byId.get(connection.employeeId);
        if (
          !employee?.isActive ||
          employee.authVersion !== connection.authVersion ||
          connection.expiresAt <= Date.now() ||
          (settings.mode === 'Solo' &&
            (settings.ownerEmployeeId !== employee.id ||
              employee.role !== 'HRAdmin'))
        ) {
          this.disconnect(connection.client);
          continue;
        }
        (connection.client.data as { user: JwtUser }).user = {
          id: employee.id,
          email: employee.email,
          role: employee.role,
        };
        (connection.client.data as { soloOwnerId: string | null }).soloOwnerId =
          settings.mode === 'Solo' ? settings.ownerEmployeeId : null;
        recipients.push(connection.client);
      }
      return recipients;
    } catch {
      // A database failure must not widen event visibility. Clients reconnect
      // through the ordinary authenticated handshake after the outage.
      for (const connection of connections) this.disconnect(connection.client);
      this.logger.warn(
        'Realtime authorization unavailable; connections closed',
      );
      return [];
    }
  }

  private disconnect(client: Socket): void {
    const connection = this.connections.get(client.id);
    if (connection) clearTimeout(connection.expiryTimer);
    this.connections.delete(client.id);
    client.disconnect(true);
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
