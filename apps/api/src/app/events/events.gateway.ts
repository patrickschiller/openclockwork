import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`socket disconnected: ${client.id}`);
  }

  broadcast<T>(event: string, payload: T): void {
    if (!this.server) return;
    this.server.emit(event, payload);
  }
}
