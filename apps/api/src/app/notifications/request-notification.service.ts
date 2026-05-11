import { Injectable, Logger } from '@nestjs/common';
import type { Request } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class RequestNotificationService {
  private readonly logger = new Logger(RequestNotificationService.name);

  constructor(private readonly events: EventsGateway) {}

  notifyTransitioned(request: Request, eventKind: string, actorId?: string | null): void {
    this.logger.log(
      `request ${request.id} → ${request.workflowState} (${eventKind}) by ${actorId ?? 'system'}`,
    );
    this.events.broadcast('request:transitioned', {
      id: request.id,
      employeeId: request.employeeId,
      workflowState: request.workflowState,
      status: request.status,
      eventKind,
      actorId: actorId ?? null,
    });
  }
}
