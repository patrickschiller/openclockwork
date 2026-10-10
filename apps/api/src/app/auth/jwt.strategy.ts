import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Token type — guards against using a refresh-token as an access-token. */
  typ: TokenType;
  ver?: number;
}

export interface JwtUser {
  id: string;
  email: string;
  role: Role;
  authVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    if (!payload?.sub) throw new UnauthorizedException('Malformed token');
    // Reject refresh tokens here — they belong only to /api/auth/refresh.
    // Tokens issued before this guard existed lack `typ`; treat those as
    // access tokens so existing sessions keep working.
    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException(
        'Refresh tokens are not valid for API access',
      );
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
    });
    if (!employee?.isActive || (payload.ver ?? 0) !== employee.authVersion)
      throw new UnauthorizedException('Session no longer valid');
    return {
      id: employee.id,
      email: employee.email,
      role: employee.role,
      authVersion: payload.ver ?? 0,
    };
  }
}
