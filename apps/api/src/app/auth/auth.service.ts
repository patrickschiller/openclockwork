import { randomUUID } from 'crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ThemePreference } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './jwt.strategy';
import type { EmployeeProfile, LoginResponse, RefreshResponse } from './auth.dto';

const ACCESS_TTL = '15m';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL = '7d';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const employee = await this.prisma.employee.findUnique({ where: { email } });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, employee.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.issueTokenPair({
      sub: employee.id,
      email: employee.email,
      role: employee.role,
    });
    return {
      ...tokens,
      employee: this.toProfile(employee),
    };
  }

  async getProfile(employeeId: string): Promise<EmployeeProfile> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Account is no longer active');
    }
    return this.toProfile(employee);
  }

  async updatePreferences(
    employeeId: string,
    themePreference: ThemePreference,
  ): Promise<EmployeeProfile> {
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { themePreference },
    }).catch(() => {
      throw new NotFoundException('Employee not found');
    });
    return this.toProfile(updated);
  }

  private toProfile(employee: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    themePreference: ThemePreference;
  }): EmployeeProfile {
    return {
      id: employee.id,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      themePreference: employee.themePreference,
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Token is not a refresh token');
    }
    // Re-check the employee exists and is still active — a deactivation
    // between login and refresh must invalidate the session.
    const employee = await this.prisma.employee.findUnique({ where: { id: payload.sub } });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Account is no longer active');
    }
    return this.issueTokenPair({
      sub: employee.id,
      email: employee.email,
      role: employee.role,
    });
  }

  /**
   * Sign a fresh access + refresh token for the same identity. Both share
   * the same signing secret; they're disambiguated by the `typ` claim and
   * by their TTL. We rotate refresh tokens on every refresh so a leaked
   * pair has at most a 7-day window.
   */
  private async issueTokenPair(base: Omit<JwtPayload, 'typ'>): Promise<RefreshResponse> {
    // `jwtid` ensures every token has a unique string even when signed at the
    // same second with the same payload (otherwise login + immediate refresh
    // would mint identical access tokens).
    const accessToken = await this.jwt.signAsync(
      { ...base, typ: 'access' satisfies JwtPayload['typ'] },
      { expiresIn: ACCESS_TTL, jwtid: randomUUID() },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, typ: 'refresh' satisfies JwtPayload['typ'] },
      { expiresIn: REFRESH_TTL, jwtid: randomUUID() },
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
  }
}
