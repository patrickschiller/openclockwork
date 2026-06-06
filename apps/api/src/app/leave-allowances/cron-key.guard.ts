import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Header-based guard for unattended cron callers. Reads CRON_API_KEY from
 * config and compares against the `X-Cron-Key` request header. Designed
 * for the scheduled ACA Job that drives the carry-over expiry — see
 * infra/azure/main.bicep.
 */
@Injectable()
export class CronKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('CRON_API_KEY');
    if (!expected) throw new UnauthorizedException('Cron API key not configured');
    const req = context.switchToHttp().getRequest<RequestLike>();
    const raw = req.headers['x-cron-key'];
    const presented = Array.isArray(raw) ? raw[0] : raw;
    if (!presented || presented !== expected) {
      throw new UnauthorizedException('Invalid or missing X-Cron-Key');
    }
    return true;
  }
}
