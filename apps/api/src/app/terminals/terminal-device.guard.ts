import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface TerminalDevicePrincipal {
  id: string;
  terminalId: string;
}

export interface TerminalDeviceRequest {
  headers: Record<string, string | string[] | undefined>;
  terminalDevice?: TerminalDevicePrincipal;
}

@Injectable()
export class TerminalDeviceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TerminalDeviceRequest>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    const token = value?.startsWith('Bearer ') ? value.slice(7).trim() : '';
    if (!token || token.length > 256) {
      throw new UnauthorizedException('Valid terminal device token required');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const device = await this.prisma.terminalDevice.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        terminalId: true,
        lastSeenAt: true,
        revokedAt: true,
        terminal: { select: { isActive: true } },
      },
    });
    if (!device || device.revokedAt || !device.terminal.isActive) {
      throw new UnauthorizedException('Terminal device is inactive or revoked');
    }

    const now = new Date();
    const lastSeenCutoff = new Date(now.getTime() - 30_000);
    if (!device.lastSeenAt || device.lastSeenAt < lastSeenCutoff) {
      await this.prisma.terminalDevice.updateMany({
        where: {
          id: device.id,
          revokedAt: null,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: lastSeenCutoff } }],
        },
        data: { lastSeenAt: now },
      });
    }
    request.terminalDevice = { id: device.id, terminalId: device.terminalId };
    return true;
  }
}
