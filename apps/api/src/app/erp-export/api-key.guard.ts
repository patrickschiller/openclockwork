import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ERP_API_KEY');
    if (!expected) throw new UnauthorizedException('ERP API key not configured');
    const req = context.switchToHttp().getRequest<RequestLike>();
    const raw = req.headers['x-api-key'];
    const presented = Array.isArray(raw) ? raw[0] : raw;
    if (!presented || presented !== expected) {
      throw new UnauthorizedException('Invalid or missing X-Api-Key');
    }
    return true;
  }
}
