import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ThemePreference } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstallationService } from '../installation/installation.service';
import type { JwtPayload } from './jwt.strategy';
import type {
  EmployeeProfile,
  LoginResponse,
  RefreshResponse,
} from './auth.dto';

const ACCESS_TTL = '15m';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL = '7d';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly installation: InstallationService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const employee = await this.prisma.employee.findUnique({
      where: { email },
    });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, employee.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    await this.installation.assertActorAccess(employee.id);

    const tokens = await this.issueTokenPair({
      sub: employee.id,
      email: employee.email,
      role: employee.role,
      ver: employee.authVersion,
    });
    return {
      ...tokens,
      employee: this.toProfile(employee),
    };
  }

  async getProfile(employeeId: string): Promise<EmployeeProfile> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Account is no longer active');
    }
    return this.toProfile(employee);
  }

  async changePassword(
    employeeId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (
      !employee?.isActive ||
      !(await bcrypt.compare(currentPassword, employee.passwordHash))
    )
      throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const changed = await this.prisma.employee.updateMany({
      where: { id: employeeId, passwordHash: employee.passwordHash },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    if (!changed.count)
      throw new UnauthorizedException(
        'Password already changed; sign in again',
      );
    return { changed: true };
  }

  async updateOwnProfile(
    employeeId: string,
    dto: { firstName: string; lastName: string; email: string },
  ): Promise<EmployeeProfile> {
    await this.installation.requireOwner(employeeId);
    const firstName = dto.firstName.trim(),
      lastName = dto.lastName.trim();
    if (!firstName || !lastName)
      throw new BadRequestException('A name is required');
    try {
      return this.toProfile(
        await this.prisma.employee.update({
          where: { id: employeeId },
          data: { firstName, lastName, email: dto.email.trim().toLowerCase() },
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('Email is already in use');
      throw error;
    }
  }

  async updatePreferences(
    employeeId: string,
    themePreference: ThemePreference,
  ): Promise<EmployeeProfile> {
    const updated = await this.prisma.employee
      .update({
        where: { id: employeeId },
        data: { themePreference },
      })
      .catch(() => {
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
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
    });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Account is no longer active');
    }
    if ((payload.ver ?? 0) !== employee.authVersion)
      throw new UnauthorizedException('Session no longer valid');
    await this.installation.assertActorAccess(employee.id);
    return this.issueTokenPair({
      sub: employee.id,
      email: employee.email,
      role: employee.role,
      ver: employee.authVersion,
    });
  }

  /**
   * Sign a fresh access + refresh token for the same identity. Both share
   * the same signing secret; they're disambiguated by the `typ` claim and
   * by their TTL. We rotate refresh tokens on every refresh so a leaked
   * pair has at most a 7-day window.
   */
  private async issueTokenPair(
    base: Omit<JwtPayload, 'typ'>,
  ): Promise<RefreshResponse> {
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
