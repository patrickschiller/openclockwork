import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma, TerminalBookingGrant } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { EventsGateway } from '../events/events.gateway';
import { TerminalAuditService } from './terminal-audit.service';
import { TerminalPinService } from './terminal-pin.service';
import { TerminalsService } from './terminals.service';
import { lockTerminalSecurity } from './terminal-security-locks';
import { bookTerminalTime } from './terminal-booking.service';
import type { TerminalDevicePrincipal } from './terminal-device.guard';
import type {
  BookTerminalDto,
  BookTerminalResultDto,
  IdentifyTerminalDto,
} from './terminal-auth.dto';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const MINUTE = 60_000;
const PIN_WINDOW = 15 * MINUTE;

@Injectable()
export class TerminalAuthService {
  private hashesInFlight = 0;
  constructor(
    private readonly prisma: PrismaService,
    private readonly pins: TerminalPinService,
    private readonly audit: TerminalAuditService,
    private readonly terminals: TerminalsService,
    private readonly schedules: WorkSchedulesService,
    private readonly events: EventsGateway,
  ) {}

  private async device(
    tx: Prisma.TransactionClient,
    principal: TerminalDevicePrincipal,
  ) {
    const device = await tx.terminalDevice.findUnique({
      where: { id: principal.id },
      include: { terminal: true },
    });
    if (
      !device ||
      device.terminalId !== principal.terminalId ||
      device.revokedAt ||
      !device.terminal.isActive
    )
      throw new UnauthorizedException({
        code: 'TERMINAL_DEVICE_REVOKED',
        message: 'Terminal device is inactive or revoked',
      });
    return device;
  }
  private method(methods: string[]) {
    if (!methods.includes('PIN'))
      throw new ForbiddenException({
        code: 'TERMINAL_METHOD_DISABLED',
        message: 'Terminal method is disabled',
      });
    this.pins.assertAvailable();
  }
  private limited() {
    return new HttpException(
      {
        code: 'TERMINAL_AUTH_RATE_LIMITED',
        message: 'Too many terminal requests; try again shortly',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  /** Caller holds installation lock. Increment is committed even for denial. */
  private async budget(
    tx: Prisma.TransactionClient,
    key: string,
    limit: number,
    windowMs: number,
    now: Date,
  ) {
    const row = await tx.terminalAuthAttemptState.findUnique({
      where: { key },
    });
    const resets =
      !row || now.getTime() - row.windowStartedAt.getTime() >= windowMs;
    const counter = resets ? 1 : Math.min(row.counter + 1, limit + 2);
    await tx.terminalAuthAttemptState.upsert({
      where: { key },
      create: {
        key,
        counter,
        windowStartedAt: now,
        expiresAt: new Date(now.getTime() + windowMs),
      },
      update: {
        counter,
        ...(resets
          ? {
              windowStartedAt: now,
              expiresAt: new Date(now.getTime() + windowMs),
            }
          : {}),
      },
    });
    return counter <= limit;
  }
  private async reserve(
    principal: TerminalDevicePrincipal,
    kind: 'challenge' | 'identify' | 'book',
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await lockTerminalSecurity(tx);
      const device = await this.device(tx, principal);
      const now = new Date();
      const deviceAllowed = await this.budget(
        tx,
        `${kind}:device:${device.id}`,
        kind === 'book' ? 120 : 60,
        MINUTE,
        now,
      );
      const terminalAllowed = await this.budget(
        tx,
        `${kind}:terminal:${device.terminalId}`,
        kind === 'book' ? 240 : 120,
        MINUTE,
        now,
      );
      const burstAllowed = await this.budget(
        tx,
        `${kind}:burst:${device.id}`,
        20,
        10_000,
        now,
      );
      let error: HttpException | null =
        deviceAllowed && terminalAllowed && burstAllowed
          ? null
          : this.limited();
      if (!error && kind !== 'book') {
        try {
          this.method(device.terminal.allowedAuthMethods);
        } catch (failure) {
          if (failure instanceof HttpException) error = failure;
          else throw failure;
        }
      }
      if (error) {
        // One durable event per device/kind/minute prevents rejected traffic
        // from becoming an unbounded audit write amplifier. Counters still persist.
        if (
          await this.budget(
            tx,
            `admission:${kind}:${device.id}`,
            1,
            MINUTE,
            now,
          )
        ) {
          await this.audit.append(
            tx,
            {
              event: 'AdmissionRejected',
              result:
                error.getStatus() === 429
                  ? 'RATE_LIMITED'
                  : 'METHOD_UNAVAILABLE',
              method: 'PIN',
              terminalId: device.terminalId,
              deviceId: device.id,
              terminalName: device.terminal.name,
              locationLabel: device.terminal.locationLabel,
            },
            false,
          );
        }
      }
      return { error, device };
    });
    if (result.error) throw result.error;
    return result.device;
  }

  private async hashAdmissionRejected(principal: TerminalDevicePrincipal) {
    await this.prisma.$transaction(async (tx) => {
      await lockTerminalSecurity(tx);
      const device = await this.device(tx, principal);
      if (
        await this.budget(
          tx,
          `hash-admission:${device.id}`,
          1,
          MINUTE,
          new Date(),
        )
      )
        await this.audit.append(tx, {
          event: 'AdmissionRejected',
          result: 'HASH_BUSY',
          method: 'PIN',
          terminalId: device.terminalId,
          deviceId: device.id,
          terminalName: device.terminal.name,
          locationLabel: device.terminal.locationLabel,
        });
    });
  }

  async challenge(principal: TerminalDevicePrincipal) {
    await this.reserve(principal, 'challenge');
    return this.prisma.$transaction(async (tx) => {
      await lockTerminalSecurity(tx);
      const device = await this.device(tx, principal);
      this.method(device.terminal.allowedAuthMethods);
      const now = new Date();
      const payload = `ocpi_${randomBytes(32).toString('base64url')}`;
      const expiresAt = new Date(
        Math.min(
          now.getTime() + 45_000,
          this.terminals
            .nextLocalMidnight(now, device.terminal.timeZone)
            .getTime(),
        ),
      );
      await tx.terminalChallenge.create({
        data: {
          terminalId: device.terminalId,
          deviceId: device.id,
          tokenHash: hash(payload),
          purpose: 'KioskIdentify',
          authConfigVersion: device.terminal.authConfigVersion,
          rootDate: new Date(
            `${this.terminals.dateKey(now, device.terminal.timeZone)}T00:00:00.000Z`,
          ),
          expiresAt,
        },
      });
      // Only ephemeral records are cleaned. Audit has a separate approved retention path.
      await tx.terminalAuthAttemptState.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - MINUTE) } },
      });
      await tx.terminalBookingGrant.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - 3 * MINUTE) } },
      });
      await tx.terminalChallenge.deleteMany({
        where: {
          deviceId: device.id,
          expiresAt: { lt: new Date(now.getTime() - 3 * MINUTE) },
          redemptions: { none: {} },
          clockInTimeEntries: { none: {} },
          clockOutTimeEntries: { none: {} },
        },
      });
      return { payload, expiresAt: expiresAt.toISOString() };
    });
  }

  private async validChallenge(
    tx: Prisma.TransactionClient,
    tokenHash: string,
    principal: TerminalDevicePrincipal,
    now: Date,
    configVersion: number,
    timeZone: string,
  ) {
    const challenge = await tx.terminalChallenge.findUnique({
      where: { tokenHash },
    });
    if (
      !challenge ||
      challenge.purpose !== 'KioskIdentify' ||
      challenge.deviceId !== principal.id ||
      challenge.terminalId !== principal.terminalId ||
      challenge.authConfigVersion !== configVersion ||
      challenge.expiresAt <= now ||
      challenge.rootDate.toISOString().slice(0, 10) !==
        this.terminals.dateKey(now, timeZone)
    )
      throw new ConflictException({
        code: 'TERMINAL_CHALLENGE_INVALID',
        message: 'Identification challenge is invalid or expired',
      });
    return challenge;
  }

  async identify(dto: IdentifyTerminalDto, principal: TerminalDevicePrincipal) {
    const reservedDevice = await this.reserve(principal, 'identify');
    if (this.hashesInFlight >= 4) {
      await this.hashAdmissionRejected(principal);
      throw this.limited();
    }
    this.hashesInFlight += 1;
    try {
      const initial = await this.prisma.$transaction(async (tx) => {
        await lockTerminalSecurity(tx);
        const device = await this.device(tx, principal);
        this.method(device.terminal.allowedAuthMethods);
        await this.validChallenge(
          tx,
          hash(dto.challengePayload),
          principal,
          new Date(),
          device.terminal.authConfigVersion,
          device.terminal.timeZone,
        );
        const employee = await tx.employee.findUnique({
          where: { personalNo: dto.personalNo },
          include: { terminalCredential: true },
        });
        const attempt = employee
          ? await tx.terminalAuthAttemptState.findUnique({
              where: { key: `pin:${employee.id}` },
            })
          : null;
        const eligible =
          !!employee?.isActive &&
          !!employee.terminalCredential &&
          !employee.terminalCredential.revokedAt &&
          !(attempt?.lockedUntil && attempt.lockedUntil > new Date());
        return {
          employee,
          credential: eligible ? (employee?.terminalCredential ?? null) : null,
        };
      });
      const matches = await this.pins.verify(
        dto.pin,
        initial.credential?.pinHash,
        initial.credential?.pepperVersion,
      );
      const result = await this.prisma.$transaction(async (tx) => {
        await lockTerminalSecurity(tx, initial.employee?.id);
        const device = await this.device(tx, principal);
        this.method(device.terminal.allowedAuthMethods);
        const now = new Date();
        const challenge = await this.validChallenge(
          tx,
          hash(dto.challengePayload),
          principal,
          now,
          device.terminal.authConfigVersion,
          device.terminal.timeZone,
        );
        const employee = initial.employee
          ? await tx.employee.findUnique({
              where: { id: initial.employee.id },
              include: { terminalCredential: true },
            })
          : null;
        const credential = employee?.terminalCredential;
        const key = employee ? `pin:${employee.id}` : null;
        const state = key
          ? await tx.terminalAuthAttemptState.findUnique({ where: { key } })
          : null;
        const locked = !!state?.lockedUntil && state.lockedUntil > now;
        const accepted =
          matches &&
          employee?.isActive &&
          !locked &&
          credential &&
          !credential.revokedAt &&
          credential.version === initial.credential?.version &&
          employee.personalNo === dto.personalNo;
        const auditContext = {
          method: 'PIN' as const,
          employeeId: employee?.id,
          terminalId: device.terminalId,
          deviceId: device.id,
          terminalName: device.terminal.name,
          locationLabel: device.terminal.locationLabel,
        };
        if (!accepted) {
          let newlyLocked = false;
          // An in-flight verification of an old PIN must not penalize its replacement.
          if (
            key &&
            credential &&
            !credential.revokedAt &&
            employee?.isActive &&
            !locked &&
            credential.version === initial.credential?.version
          ) {
            const counter =
              !state ||
              state.windowStartedAt.getTime() + PIN_WINDOW <= now.getTime()
                ? 1
                : state.counter + 1;
            newlyLocked = counter >= 5;
            await tx.terminalAuthAttemptState.upsert({
              where: { key },
              create: {
                key,
                counter,
                windowStartedAt: now,
                lockedUntil: newlyLocked
                  ? new Date(now.getTime() + PIN_WINDOW)
                  : null,
                expiresAt: new Date(now.getTime() + 2 * PIN_WINDOW),
              },
              update: {
                counter,
                ...(!state ||
                state.windowStartedAt.getTime() + PIN_WINDOW <= now.getTime()
                  ? { windowStartedAt: now }
                  : {}),
                lockedUntil: newlyLocked
                  ? new Date(now.getTime() + PIN_WINDOW)
                  : null,
                expiresAt: new Date(now.getTime() + 2 * PIN_WINDOW),
              },
            });
          }
          await this.audit.append(tx, {
            ...auditContext,
            event: 'IdentificationRejected',
            result: 'AUTH_FAILED',
          });
          if (newlyLocked)
            await this.audit.append(tx, {
              ...auditContext,
              event: 'PinLocked',
              result: 'LOCKED',
            });
          return null;
        }
        if (key)
          await tx.terminalAuthAttemptState.deleteMany({ where: { key } });
        const grant = `octg_${randomBytes(32).toString('base64url')}`;
        const expiresAt = new Date(
          Math.min(now.getTime() + 30_000, challenge.expiresAt.getTime()),
        );
        await tx.terminalBookingGrant.create({
          data: {
            tokenHash: hash(grant),
            employeeId: employee.id,
            credentialId: credential.id,
            credentialVersion: credential.version,
            terminalId: device.terminalId,
            deviceId: device.id,
            challengeId: challenge.id,
            authConfigVersion: device.terminal.authConfigVersion,
            expiresAt,
          },
        });
        const open = await tx.timeEntry.findFirst({
          where: { employeeId: employee.id, clockOut: null, voidedAt: null },
          select: { id: true },
        });
        await this.audit.append(tx, {
          ...auditContext,
          event: 'IdentificationAccepted',
          result: 'SUCCESS',
        });
        return {
          grant,
          expiresAt: expiresAt.toISOString(),
          displayName: `${employee.firstName} ${Array.from(employee.lastName)[0] ?? ''}.`,
          action: open ? ('clock-out' as const) : ('clock-in' as const),
          requiresLocation: device.terminal.enforceGeofence,
        };
      });
      if (!result)
        throw new UnauthorizedException({
          code: 'TERMINAL_AUTH_FAILED',
          message: 'Identification failed',
        });
      return result;
    } catch (error) {
      // Credential rejections have already committed their counter and event.
      const response =
        error instanceof HttpException ? error.getResponse() : null;
      if (
        !(
          response &&
          typeof response === 'object' &&
          'code' in response &&
          response.code === 'TERMINAL_AUTH_FAILED'
        )
      ) {
        await this.audit.failure({
          event: 'IdentificationRejected',
          result: 'REQUEST_REJECTED',
          method: 'PIN',
          terminalId: reservedDevice.terminalId,
          deviceId: reservedDevice.id,
          terminalName: reservedDevice.terminal.name,
          locationLabel: reservedDevice.terminal.locationLabel,
        });
      }
      throw error;
    } finally {
      this.hashesInFlight -= 1;
    }
  }

  private receipt(grant: TerminalBookingGrant): BookTerminalResultDto {
    if (!grant.bookedAt || !grant.action)
      throw new ConflictException('Incomplete booking receipt');
    return {
      code: 'TERMINAL_BOOKED',
      action: grant.action as 'clock-in' | 'clock-out',
      bookedAt: grant.bookedAt.toISOString(),
      receiptId: grant.id,
    };
  }

  async book(
    dto: BookTerminalDto,
    principal: TerminalDevicePrincipal,
  ): Promise<BookTerminalResultDto> {
    const reservedDevice = await this.reserve(principal, 'book');
    let employeeId: string | undefined;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await lockTerminalSecurity(tx);
        const device = await this.device(tx, principal);
        const grant = await tx.terminalBookingGrant.findUnique({
          where: { tokenHash: hash(dto.grant) },
        });
        if (
          !grant ||
          grant.deviceId !== device.id ||
          grant.terminalId !== device.terminalId
        )
          throw new ConflictException({
            code: 'TERMINAL_GRANT_INVALID',
            message: 'Booking permission is invalid',
          });
        employeeId = grant.employeeId;
        await lockTerminalSecurity(tx, employeeId);
        const employee = await tx.employee.findUnique({
          where: { id: employeeId },
          select: { isActive: true },
        });
        if (!employee?.isActive)
          throw new ConflictException({
            code: 'TERMINAL_GRANT_INVALID',
            message: 'Booking permission is no longer valid',
          });
        const now = new Date();
        if (grant.consumedAt) {
          if (
            grant.action !== dto.action ||
            now.getTime() > grant.consumedAt.getTime() + 2 * MINUTE
          )
            throw new ConflictException({
              code: 'TERMINAL_GRANT_CONSUMED',
              message: 'Booking permission was already used',
            });
          return {
            response: this.receipt(grant),
            entry: null,
            action: dto.action,
          };
        }
        this.method(device.terminal.allowedAuthMethods);
        const credential = await tx.terminalCredential.findUnique({
          where: { employeeId },
        });
        const pinState = await tx.terminalAuthAttemptState.findUnique({
          where: { key: `pin:${employeeId}` },
        });
        if (
          (pinState?.lockedUntil && pinState.lockedUntil > now) ||
          !credential ||
          credential.revokedAt ||
          credential.id !== grant.credentialId ||
          credential.version !== grant.credentialVersion ||
          grant.authConfigVersion !== device.terminal.authConfigVersion
        )
          throw new ConflictException({
            code: 'TERMINAL_GRANT_REVOKED',
            message: 'Booking permission was revoked',
          });
        if (grant.expiresAt <= now)
          throw new ConflictException({
            code: 'TERMINAL_GRANT_EXPIRED',
            message: 'Booking permission expired',
          });
        const challenge = await tx.terminalChallenge.findUnique({
          where: { id: grant.challengeId },
          include: { terminal: true },
        });
        if (
          !challenge ||
          challenge.purpose !== 'KioskIdentify' ||
          challenge.deviceId !== device.id ||
          challenge.terminalId !== device.terminalId ||
          challenge.expiresAt <= now ||
          challenge.rootDate.toISOString().slice(0, 10) !==
            this.terminals.dateKey(now, device.terminal.timeZone)
        )
          throw new ConflictException({
            code: 'TERMINAL_GRANT_EXPIRED',
            message: 'Booking challenge expired',
          });
        if (
          await tx.terminalChallengeRedemption.findUnique({
            where: {
              challengeId_employeeId: { challengeId: challenge.id, employeeId },
            },
          })
        )
          throw new ConflictException({
            code: 'TERMINAL_CHALLENGE_REPLAYED',
            message: 'Identification challenge was already used',
          });
        const position = this.terminals.evaluateTerminalPosition(
          dto,
          device.terminal,
          now,
        );
        const schedule = await this.schedules.resolveForEmployee(employeeId);
        const booked = await bookTerminalTime(
          tx,
          employeeId,
          challenge,
          now,
          schedule,
          position,
          dto.action,
        );
        const consumed = await tx.terminalBookingGrant.update({
          where: { id: grant.id },
          data: {
            consumedAt: now,
            action: dto.action,
            timeEntryId: booked.entry.id,
            bookedAt: now,
          },
        });
        await this.audit.append(tx, {
          event: 'BookingAccepted',
          result: 'SUCCESS',
          method: 'PIN',
          action: dto.action,
          employeeId,
          terminalId: device.terminalId,
          deviceId: device.id,
          terminalName: device.terminal.name,
          locationLabel: device.terminal.locationLabel,
          timeEntryId: booked.entry.id,
        });
        return {
          response: this.receipt(consumed),
          entry: booked.entry,
          action: booked.action,
        };
      });
      if (result.entry)
        this.events.broadcast(
          result.action === 'clock-in'
            ? 'time-entry:created'
            : 'time-entry:updated',
          {
            id: result.entry.id,
            employeeId: result.entry.employeeId,
            ...(result.action === 'clock-in'
              ? { clockIn: result.entry.clockIn.toISOString() }
              : { clockOut: result.entry.clockOut?.toISOString() ?? null }),
          },
        );
      return result.response;
    } catch (error) {
      await this.audit.failure({
        event: 'BookingRejected',
        result: 'REQUEST_REJECTED',
        method: 'PIN',
        action: dto.action,
        employeeId,
        terminalId: reservedDevice.terminalId,
        deviceId: reservedDevice.id,
        terminalName: reservedDevice.terminal.name,
        locationLabel: reservedDevice.terminal.locationLabel,
      });
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException({
          code: 'TERMINAL_BOOKING_CONFLICT',
          message: 'Booking state changed',
        });
      throw error;
    }
  }
}
