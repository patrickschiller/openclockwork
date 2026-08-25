import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtUser } from '../auth/jwt.strategy';
import type { TerminalDevicePrincipal } from './terminal-device.guard';

type TerminalRateLimitKind = 'pair' | 'kiosk' | 'scan';

const TERMINAL_RATE_LIMIT = 'openclockwork:terminal-rate-limit';
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;
const LIMITS: Record<TerminalRateLimitKind, number> = {
  pair: 30,
  kiosk: 12,
  scan: 12,
};

interface RateLimitBucket {
  count: number;
  windowStartedAt: number;
}

interface RateLimitedRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: JwtUser;
  terminalDevice?: TerminalDevicePrincipal;
}

interface RateLimitedResponse {
  setHeader(name: string, value: string): void;
}

export const TerminalRateLimit = (kind: TerminalRateLimitKind) =>
  SetMetadata(TERMINAL_RATE_LIMIT, kind);

/**
 * A deliberately small, synchronous per-process limiter for the three kiosk
 * entry points. OpenClockwork officially supports up to three API processes;
 * this guard protects each process before terminal business logic/DB writes,
 * while the database constraints and counters remain defense in depth.
 */
@Injectable()
export class TerminalRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastCleanupAt = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const kind = this.reflector.getAllAndOverride<TerminalRateLimitKind>(
      TERMINAL_RATE_LIMIT,
      [context.getHandler(), context.getClass()],
    );
    if (!kind) return true;

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const response = context.switchToHttp().getResponse<RateLimitedResponse>();
    const identity = this.identity(kind, request);
    const key = `${kind}:${identity}`;
    const now = Date.now();
    this.cleanup(now);

    const existing = this.buckets.get(key);
    const bucket =
      !existing || now - existing.windowStartedAt >= WINDOW_MS
        ? { count: 0, windowStartedAt: now }
        : existing;
    bucket.count += 1;
    this.buckets.set(key, bucket);

    const limit = LIMITS[kind];
    if (bucket.count <= limit) return true;

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.windowStartedAt + WINDOW_MS - now) / 1000),
    );
    response.setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpException(
      {
        code: `TERMINAL_${kind.toUpperCase()}_RATE_LIMITED`,
        message: 'Too many terminal requests; try again shortly',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private identity(
    kind: TerminalRateLimitKind,
    request: RateLimitedRequest,
  ): string {
    if (kind === 'kiosk') {
      if (!request.terminalDevice?.id) {
        throw new UnauthorizedException('Terminal device is not authenticated');
      }
      return request.terminalDevice.id;
    }
    if (kind === 'scan') {
      if (!request.user?.id) {
        throw new UnauthorizedException('Employee is not authenticated');
      }
      return request.user.id;
    }
    // Do not trust a client-provided forwarding header. Express' `ip` falls
    // back to this same peer address unless a deployment explicitly opts into
    // trusted proxies.
    return request.socket?.remoteAddress ?? request.ip ?? 'unknown-peer';
  }

  private cleanup(now: number): void {
    if (
      now - this.lastCleanupAt < WINDOW_MS &&
      this.buckets.size < MAX_BUCKETS
    ) {
      return;
    }
    this.lastCleanupAt = now;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStartedAt >= WINDOW_MS) {
        this.buckets.delete(key);
      }
    }
    while (this.buckets.size >= MAX_BUCKETS) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }
}
