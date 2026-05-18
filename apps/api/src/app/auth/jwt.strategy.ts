import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@prisma/client';

export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Token type — guards against using a refresh-token as an access-token. */
  typ: TokenType;
}

export interface JwtUser {
  id: string;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): JwtUser {
    if (!payload?.sub) throw new UnauthorizedException('Malformed token');
    // Reject refresh tokens here — they belong only to /api/auth/refresh.
    // Tokens issued before this guard existed lack `typ`; treat those as
    // access tokens so existing sessions keep working.
    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException('Refresh tokens are not valid for API access');
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
