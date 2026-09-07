import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Terminal, type TimeEntry } from '@prisma/client';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { requiresSpecialApproval } from 'shared';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { toTimeEntryDto } from '../time-entries/time-entries.dto';
import {
  toTerminalDto,
  type CreateTerminalDto,
  type KioskStateDto,
  type PairedTerminalDto,
  type PairingCodeDto,
  type PairTerminalDto,
  type ScanTerminalDto,
  type ScanTerminalResultDto,
  type SupportPromptDto,
  type TerminalDto,
  type UpdateTerminalDto,
} from './terminals.dto';
import type { TerminalDevicePrincipal } from './terminal-device.guard';

const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_LOGO_BYTES = 60 * 1024;
const TERMINAL_INCLUDE = {
  devices: { orderBy: { createdAt: 'desc' as const } },
} as const;
const ENTRY_INCLUDE = {
  project: { select: { code: true, name: true } },
  serviceOrder: { select: { orderNo: true, title: true } },
} as const;

type BookingAction = 'clock-in' | 'clock-out';
type AcceptedTerminalPosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  positionTimestamp: Date;
  distanceMeters: number;
};

@Injectable()
export class TerminalsService {
  private readonly qrMasterSecret: Buffer;
  private readonly challengeTtlSeconds: number;
  private readonly pairingTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly schedules: WorkSchedulesService,
    private readonly events: EventsGateway,
  ) {
    const terminalSecret = this.config
      .get<string>('TERMINAL_QR_SECRET')
      ?.trim();
    const jwtSecret = this.config.get<string>('JWT_SECRET')?.trim();
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      !terminalSecret
    ) {
      throw new Error('TERMINAL_QR_SECRET must be configured in production');
    }
    const master = terminalSecret || jwtSecret;
    if (!master) {
      throw new Error('TERMINAL_QR_SECRET or JWT_SECRET must be configured');
    }
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      master.length < 32
    ) {
      throw new Error(
        'Terminal QR master secret must be at least 32 characters',
      );
    }
    this.qrMasterSecret = Buffer.from(master, 'utf8');
    this.challengeTtlSeconds = this.clampConfig(
      'TERMINAL_CHALLENGE_TTL_SECONDS',
      45,
      30,
      60,
    );
    this.pairingTtlSeconds = this.clampConfig(
      'TERMINAL_PAIRING_TTL_SECONDS',
      10 * 60,
      60,
      30 * 60,
    );
  }

  async list(): Promise<TerminalDto[]> {
    const terminals = await this.prisma.terminal.findMany({
      include: TERMINAL_INCLUDE,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return terminals.map(toTerminalDto);
  }

  async get(id: string): Promise<TerminalDto> {
    return toTerminalDto(await this.findTerminal(id));
  }

  async create(dto: CreateTerminalDto): Promise<TerminalDto> {
    const data = this.createData(dto);
    const now = new Date();
    const terminal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.terminal.create({
        data: {
          ...data,
          isActive: dto.isActive ?? false,
          activatedAt: dto.isActive ? now : null,
        },
        include: TERMINAL_INCLUDE,
      });
      if (created.isActive) await this.recordFirstActivation(tx, now);
      return created;
    });
    return toTerminalDto(terminal);
  }

  async update(id: string, dto: UpdateTerminalDto): Promise<TerminalDto> {
    const now = new Date();
    const terminal = await this.prisma.$transaction(async (tx) => {
      const current = await tx.terminal.findUnique({ where: { id } });
      if (!current) throw new NotFoundException(`Terminal ${id} not found`);
      const data = this.updateData(dto, current);
      const activates = dto.isActive === true && !current.isActive;
      if (dto.isActive === false) {
        await tx.terminalDevice.updateMany({
          where: { terminalId: id, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      const updated = await tx.terminal.update({
        where: { id },
        data: {
          ...data,
          ...(activates ? { activatedAt: now } : {}),
        },
        include: TERMINAL_INCLUDE,
      });
      if (activates) await this.recordFirstActivation(tx, now);
      return updated;
    });
    return toTerminalDto(terminal);
  }

  deactivate(id: string): Promise<TerminalDto> {
    return this.update(id, { isActive: false });
  }

  async deletePermanently(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const terminal = await tx.terminal.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!terminal) throw new NotFoundException(`Terminal ${id} not found`);

      // Clear only entity references. The denormalized position, accuracy and
      // radius values on TimeEntry are the durable booking audit record.
      await tx.timeEntry.updateMany({
        where: { terminalId: id },
        data: { terminalId: null },
      });
      await tx.timeEntry.updateMany({
        where: { clockOutTerminalId: id },
        data: { clockOutTerminalId: null },
      });
      await tx.timeEntry.updateMany({
        where: { clockInChallenge: { is: { terminalId: id } } },
        data: { clockInChallengeId: null },
      });
      await tx.timeEntry.updateMany({
        where: { clockOutChallenge: { is: { terminalId: id } } },
        data: { clockOutChallengeId: null },
      });

      await tx.terminal.delete({ where: { id } });
    });
  }

  async createPairing(id: string): Promise<PairingCodeDto> {
    const terminal = await this.findTerminal(id);
    if (!terminal.isActive) {
      throw new ConflictException(
        'Terminal must be active before a kiosk can be paired',
      );
    }
    const expiresAt = new Date(Date.now() + this.pairingTtlSeconds * 1000);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const rawCode = this.randomPairingCode();
      const pairingCode = `${rawCode.slice(0, 5)}-${rawCode.slice(5)}`;
      try {
        const updated = await this.prisma.terminal.updateMany({
          where: { id, isActive: true },
          data: {
            pairingCodeHash: this.hashPairingCode(rawCode),
            pairingExpiresAt: expiresAt,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Terminal was deactivated while creating the pairing code',
          );
        }
        return {
          pairingCode,
          pairingUrl: `/kiosk?pairing=${encodeURIComponent(pairingCode)}`,
          expiresAt: expiresAt.toISOString(),
        };
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique pairing code');
  }

  async pair(dto: PairTerminalDto): Promise<PairedTerminalDto> {
    const normalizedCode = this.normalizePairingCode(dto.pairingCode);
    const pairingCodeHash = this.hashPairingCode(normalizedCode);
    const candidate = await this.prisma.terminal.findUnique({
      where: { pairingCodeHash },
      select: { id: true },
    });
    if (!candidate) throw new UnauthorizedException('Invalid pairing code');

    const now = new Date();
    const deviceToken = `octd_${randomBytes(32).toString('base64url')}`;
    const tokenHash = this.hashOpaqueToken(deviceToken);
    const terminal = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.terminal.updateMany({
        where: {
          id: candidate.id,
          isActive: true,
          pairingCodeHash,
          pairingExpiresAt: { gt: now },
        },
        data: { pairingCodeHash: null, pairingExpiresAt: null },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException('Pairing code expired or already used');
      }
      await tx.terminalDevice.updateMany({
        where: { terminalId: candidate.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.terminalDevice.create({
        data: {
          terminalId: candidate.id,
          name: dto.deviceName?.trim() || null,
          tokenHash,
          lastSeenAt: now,
        },
      });
      const row = await tx.terminal.findUnique({
        where: { id: candidate.id },
        include: TERMINAL_INCLUDE,
      });
      if (!row) throw new NotFoundException('Terminal no longer exists');
      return row;
    });
    return {
      deviceToken,
      terminal: {
        id: terminal.id,
        name: terminal.name,
        displayText: terminal.displayText,
        locationLabel: terminal.locationLabel,
        logoUrl: terminal.logoUrl,
        timeZone: terminal.timeZone,
      },
    };
  }

  async revokeDevice(
    terminalId: string,
    deviceId: string,
  ): Promise<TerminalDto> {
    await this.findTerminal(terminalId);
    const result = await this.prisma.terminalDevice.updateMany({
      where: { id: deviceId, terminalId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Active terminal device not found');
    }
    return this.get(terminalId);
  }

  async supportPrompt(): Promise<SupportPromptDto> {
    const state = await this.prisma.terminalSupportPrompt.findUnique({
      where: { id: 1 },
      select: { shownAt: true },
    });
    return { shownAt: state?.shownAt?.toISOString() ?? null };
  }

  async dismissSupportPrompt(): Promise<SupportPromptDto> {
    const now = new Date();
    const state = await this.prisma.$transaction(async (tx) => {
      const activeTerminals = await tx.terminal.count({
        where: { activatedAt: { not: null } },
      });
      if (activeTerminals === 0) {
        throw new BadRequestException(
          'Support prompt is only available after the first terminal activation',
        );
      }
      const existing = await tx.terminalSupportPrompt.findUnique({
        where: { id: 1 },
      });
      if (!existing) {
        throw new ConflictException('Terminal activation state is missing');
      }
      return existing.shownAt
        ? existing
        : tx.terminalSupportPrompt.update({
            where: { id: 1 },
            data: { shownAt: now },
          });
    });
    return { shownAt: state.shownAt?.toISOString() ?? now.toISOString() };
  }

  async kioskState(device: TerminalDevicePrincipal): Promise<KioskStateDto> {
    const terminal = await this.prisma.terminal.findFirst({
      where: { id: device.terminalId, isActive: true },
    });
    if (!terminal) throw new UnauthorizedException('Terminal is inactive');

    const now = new Date();
    const recentChallenges = await this.prisma.terminalChallenge.count({
      where: {
        deviceId: device.id,
        createdAt: { gt: new Date(now.getTime() - 60_000) },
      },
    });
    if (recentChallenges >= 12) {
      throw this.rateLimitException('TERMINAL_KIOSK_RATE_LIMITED');
    }
    const cleanupBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await this.prisma.terminalChallenge.deleteMany({
      where: {
        terminalId: device.terminalId,
        expiresAt: { lt: cleanupBefore },
        redemptions: { none: {} },
        clockInTimeEntries: { none: {} },
        clockOutTimeEntries: { none: {} },
      },
    });

    const rootDateKey = this.dateKey(now, terminal.timeZone);
    const dailyRoot = createHmac('sha256', this.qrMasterSecret)
      .update(`openclockwork-terminal-root:v1:${terminal.id}:${rootDateKey}`)
      .digest();
    const opaquePayload = createHmac('sha256', dailyRoot)
      .update(randomBytes(32))
      .digest('base64url');
    // The marker lets the PWA avoid requesting GPS for non-geofenced
    // terminals. It is only a UX hint: the complete token is hashed below and
    // scan() always enforces the terminal's current server-side setting.
    const payload = `ocw1.${terminal.enforceGeofence ? 'g' : 'n'}.${opaquePayload}`;
    const configuredExpiry = new Date(
      now.getTime() + this.challengeTtlSeconds * 1000,
    );
    const expiresAt = new Date(
      Math.min(
        configuredExpiry.getTime(),
        this.nextLocalMidnight(now, terminal.timeZone).getTime(),
      ),
    );
    const challengeLifetimeSeconds = Math.max(
      1,
      Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
    );
    await this.prisma.terminalChallenge.create({
      data: {
        terminalId: terminal.id,
        deviceId: device.id,
        tokenHash: this.hashOpaqueToken(payload),
        rootDate: new Date(`${rootDateKey}T00:00:00.000Z`),
        expiresAt,
      },
    });
    return {
      terminal: {
        id: terminal.id,
        name: terminal.name,
        displayText: terminal.displayText,
        locationLabel: terminal.locationLabel,
        logoUrl: terminal.logoUrl,
        timeZone: terminal.timeZone,
      },
      challenge: {
        payload,
        expiresAt: expiresAt.toISOString(),
        refreshAfterSeconds: Math.max(
          1,
          Math.min(
            Math.max(10, this.challengeTtlSeconds - 15),
            challengeLifetimeSeconds - 5,
          ),
        ),
      },
      serverTime: now.toISOString(),
    };
  }

  async scan(
    dto: ScanTerminalDto,
    employeeId: string,
  ): Promise<ScanTerminalResultDto> {
    const now = new Date();
    const recentRedemptions =
      await this.prisma.terminalChallengeRedemption.count({
        where: {
          employeeId,
          createdAt: { gt: new Date(now.getTime() - 60_000) },
        },
      });
    if (recentRedemptions >= 12) {
      throw this.rateLimitException('TERMINAL_SCAN_RATE_LIMITED');
    }
    const tokenHash = this.hashOpaqueToken(dto.qrPayload);
    const challenge = await this.prisma.terminalChallenge.findUnique({
      where: { tokenHash },
      include: { terminal: true, device: true },
    });
    if (!challenge) {
      throw new BadRequestException({
        code: 'TERMINAL_QR_INVALID',
        message: 'QR challenge is invalid',
      });
    }
    if (
      challenge.expiresAt <= now ||
      challenge.rootDate.toISOString().slice(0, 10) !==
        this.dateKey(now, challenge.terminal.timeZone)
    ) {
      throw new BadRequestException({
        code: 'TERMINAL_QR_EXPIRED',
        message: 'QR challenge has expired',
      });
    }
    if (!challenge.terminal.isActive || challenge.device.revokedAt !== null) {
      throw new ForbiddenException({
        code: 'TERMINAL_INACTIVE',
        message: 'Terminal or kiosk device is inactive',
      });
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { isActive: true },
    });
    if (!employee?.isActive) {
      throw new ForbiddenException('Employee account is not active');
    }
    const position = this.evaluateTerminalPosition(
      dto,
      challenge.terminal,
      now,
    );

    const schedule = await this.schedules.resolveForEmployee(employeeId);
    let action: BookingAction = 'clock-in';
    let acceptedPosition = position;
    let entry: TimeEntry & {
      project: { code: string; name: string } | null;
      serviceOrder: { orderNo: string; title: string } | null;
    };
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          await this.lockEmployee(tx, employeeId);
          const bookingNow = new Date();
          const activeEmployee = await tx.employee.findUnique({
            where: { id: employeeId },
            select: { isActive: true },
          });
          if (!activeEmployee?.isActive) {
            throw new ForbiddenException('Employee account is not active');
          }
          const fresh = await tx.terminalChallenge.findUnique({
            where: { id: challenge.id },
            include: { terminal: true, device: true },
          });
          if (
            !fresh ||
            fresh.expiresAt <= bookingNow ||
            !fresh.terminal.isActive ||
            fresh.device.revokedAt !== null ||
            fresh.rootDate.toISOString().slice(0, 10) !==
              this.dateKey(bookingNow, fresh.terminal.timeZone)
          ) {
            throw new ConflictException({
              code: 'TERMINAL_QR_EXPIRED',
              message: 'QR challenge expired during booking',
            });
          }
          const freshPosition = this.evaluateTerminalPosition(
            dto,
            fresh.terminal,
            bookingNow,
          );
          acceptedPosition = freshPosition;
          const redemption = await tx.terminalChallengeRedemption.findUnique({
            where: {
              challengeId_employeeId: {
                challengeId: fresh.id,
                employeeId,
              },
            },
            select: { id: true },
          });
          if (redemption) {
            throw new ConflictException({
              code: 'TERMINAL_QR_REPLAYED',
              message: 'This QR challenge was already used by the employee',
            });
          }

          const open = await tx.timeEntry.findFirst({
            where: { employeeId, clockOut: null },
            orderBy: { clockIn: 'desc' },
          });
          action = open ? 'clock-out' : 'clock-in';
          if (dto.action && dto.action !== action) {
            throw new ConflictException({
              code: 'TERMINAL_ACTION_MISMATCH',
              message: `Current employee state requires ${action}`,
              action,
            });
          }

          let booked: TimeEntry & {
            project: { code: string; name: string } | null;
            serviceOrder: { orderNo: string; title: string } | null;
          };
          if (action === 'clock-in') {
            const today = localTodayAsUtcDate(bookingNow);
            const dailyBlock = await tx.timeEntry.findUnique({
              where: {
                employeeId_bookingDate: { employeeId, bookingDate: today },
              },
              select: { id: true },
            });
            if (dailyBlock) {
              throw new ConflictException(
                'Today already has a daily-block booking',
              );
            }
            booked = await tx.timeEntry.create({
              data: {
                employeeId,
                clockIn: bookingNow,
                source: 'Terminal',
                breakRules: schedule.breakRules,
                status: 'Open',
                requiresApproval: requiresSpecialApproval(
                  bookingNow,
                  null,
                  schedule.frame,
                ),
                latitude: freshPosition?.latitude ?? null,
                longitude: freshPosition?.longitude ?? null,
                accuracyMeters: freshPosition?.accuracyMeters ?? null,
                terminalDistanceMeters: freshPosition?.distanceMeters ?? null,
                terminalRadiusMeters: freshPosition
                  ? fresh.terminal.radiusMeters
                  : null,
                terminalMaxAccuracyMeters: freshPosition
                  ? fresh.terminal.maxAccuracyMeters
                  : null,
                positionTimestamp: freshPosition?.positionTimestamp ?? null,
                terminalLocationLabel: fresh.terminal.locationLabel,
                terminalId: fresh.terminalId,
                clockInChallengeId: fresh.id,
              },
              include: ENTRY_INCLUDE,
            });
          } else {
            if (!open) throw new ConflictException('No open entry to close');
            if (bookingNow <= open.clockIn) {
              throw new BadRequestException('Clock-out must be after clock-in');
            }
            const requires = requiresSpecialApproval(
              open.clockIn,
              bookingNow,
              schedule.frame,
            );
            const updated = await tx.timeEntry.updateMany({
              where: { id: open.id, clockOut: null },
              data: {
                clockOut: bookingNow,
                status: requires ? 'Pending' : 'Approved',
                requiresApproval: requires,
                clockOutLatitude: freshPosition?.latitude ?? null,
                clockOutLongitude: freshPosition?.longitude ?? null,
                clockOutAccuracyMeters: freshPosition?.accuracyMeters ?? null,
                clockOutTerminalDistanceMeters:
                  freshPosition?.distanceMeters ?? null,
                clockOutTerminalRadiusMeters: freshPosition
                  ? fresh.terminal.radiusMeters
                  : null,
                clockOutTerminalMaxAccuracyMeters: freshPosition
                  ? fresh.terminal.maxAccuracyMeters
                  : null,
                clockOutPositionTimestamp:
                  freshPosition?.positionTimestamp ?? null,
                clockOutTerminalLocationLabel: fresh.terminal.locationLabel,
                clockOutTerminalId: fresh.terminalId,
                clockOutChallengeId: fresh.id,
              },
            });
            if (updated.count !== 1) {
              throw new ConflictException('Time entry was already closed');
            }
            const row = await tx.timeEntry.findUnique({
              where: { id: open.id },
              include: ENTRY_INCLUDE,
            });
            if (!row) throw new NotFoundException('Time entry not found');
            booked = row;
          }
          await tx.terminalChallengeRedemption.create({
            data: {
              challengeId: fresh.id,
              employeeId,
              timeEntryId: booked.id,
              action,
            },
          });
          return booked;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      entry = result;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: 'TERMINAL_BOOKING_CONFLICT',
          message: 'Challenge was replayed or the employee state changed',
        });
      }
      throw error;
    }

    if (action === 'clock-in') {
      this.events.broadcast('time-entry:created', {
        id: entry.id,
        employeeId: entry.employeeId,
        clockIn: entry.clockIn.toISOString(),
      });
    } else {
      this.events.broadcast('time-entry:updated', {
        id: entry.id,
        employeeId: entry.employeeId,
        clockOut: entry.clockOut?.toISOString() ?? null,
      });
    }
    return {
      action,
      entry: toTimeEntryDto(entry),
      distanceMeters:
        acceptedPosition === null
          ? null
          : Math.round(acceptedPosition.distanceMeters),
    };
  }

  private async findTerminal(id: string) {
    const terminal = await this.prisma.terminal.findUnique({
      where: { id },
      include: TERMINAL_INCLUDE,
    });
    if (!terminal) throw new NotFoundException(`Terminal ${id} not found`);
    return terminal;
  }

  private createData(dto: CreateTerminalDto) {
    const timeZone = (dto.timeZone ?? 'UTC').trim();
    this.assertTimeZone(timeZone);
    const enforceGeofence = dto.enforceGeofence ?? true;
    const geofence = this.resolveGeofenceConfiguration(enforceGeofence, dto);
    return {
      name: this.requiredTrimmed(dto.name, 'name'),
      displayText: this.requiredTrimmed(dto.displayText, 'displayText'),
      locationLabel: this.requiredTrimmed(dto.locationLabel, 'locationLabel'),
      logoUrl: this.normalizeLogoUrl(dto.logoUrl),
      enforceGeofence,
      ...geofence,
      timeZone,
    };
  }

  private updateData(
    dto: UpdateTerminalDto,
    current: Terminal,
  ): Prisma.TerminalUpdateInput {
    const data: Prisma.TerminalUpdateInput = {};
    if (dto.name !== undefined)
      data.name = this.requiredTrimmed(dto.name, 'name');
    if (dto.displayText !== undefined) {
      data.displayText = this.requiredTrimmed(dto.displayText, 'displayText');
    }
    if (dto.locationLabel !== undefined) {
      data.locationLabel = this.requiredTrimmed(
        dto.locationLabel,
        'locationLabel',
      );
    }
    if (dto.logoUrl !== undefined)
      data.logoUrl = this.normalizeLogoUrl(dto.logoUrl);
    if (
      dto.enforceGeofence !== undefined ||
      dto.latitude !== undefined ||
      dto.longitude !== undefined ||
      dto.radiusMeters !== undefined ||
      dto.maxAccuracyMeters !== undefined
    ) {
      const enforceGeofence = dto.enforceGeofence ?? current.enforceGeofence;
      Object.assign(
        data,
        { enforceGeofence },
        this.resolveGeofenceConfiguration(enforceGeofence, {
          latitude: dto.latitude ?? current.latitude,
          longitude: dto.longitude ?? current.longitude,
          radiusMeters: dto.radiusMeters ?? current.radiusMeters,
          maxAccuracyMeters: dto.maxAccuracyMeters ?? current.maxAccuracyMeters,
        }),
      );
    }
    if (dto.timeZone !== undefined) {
      const timeZone = dto.timeZone.trim();
      this.assertTimeZone(timeZone);
      data.timeZone = timeZone;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.isActive === false) {
      data.pairingCodeHash = null;
      data.pairingExpiresAt = null;
    }
    return data;
  }

  private resolveGeofenceConfiguration(
    enforceGeofence: boolean,
    values: {
      latitude?: Prisma.Decimal | number | null;
      longitude?: Prisma.Decimal | number | null;
      radiusMeters?: number | null;
      maxAccuracyMeters?: number | null;
    },
  ) {
    if (!enforceGeofence) {
      return {
        latitude: null,
        longitude: null,
        radiusMeters: null,
        maxAccuracyMeters: null,
      };
    }
    if (values.latitude == null || values.longitude == null) {
      throw new BadRequestException({
        code: 'TERMINAL_GEOFENCE_INCOMPLETE',
        message:
          'Latitude and longitude are required when the terminal geofence is enabled',
      });
    }
    return {
      latitude: values.latitude,
      longitude: values.longitude,
      radiusMeters: values.radiusMeters ?? 100,
      maxAccuracyMeters: values.maxAccuracyMeters ?? 100,
    };
  }

  private normalizeLogoUrl(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value.trim() === '')
      return null;
    const normalized = value.trim();
    const hasControlCharacters = Array.from(normalized).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    });
    if (
      normalized.startsWith('/') &&
      !normalized.startsWith('//') &&
      !normalized.includes('\\') &&
      !hasControlCharacters &&
      normalized.length <= 2048
    ) {
      return normalized;
    }
    const match =
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        normalized,
      );
    if (!match || match[2].length % 4 !== 0) {
      throw new BadRequestException(
        'logoUrl must be a same-origin path or PNG/JPEG/WebP base64 data URL',
      );
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.byteLength > MAX_LOGO_BYTES) {
      throw new BadRequestException('Terminal logo must not exceed 60 KiB');
    }
    const mime = match[1];
    const hasExpectedMagic =
      (mime === 'png' &&
        bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
      (mime === 'jpeg' &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff) ||
      (mime === 'webp' &&
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP');
    if (!hasExpectedMagic) {
      throw new BadRequestException(
        'Terminal logo content does not match its MIME type',
      );
    }
    return normalized;
  }

  private requiredTrimmed(value: string, field: string): string {
    const trimmed = value.trim();
    if (!trimmed) throw new BadRequestException(`${field} must not be blank`);
    return trimmed;
  }

  private assertTimeZone(timeZone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    } catch {
      throw new BadRequestException('timeZone must be a valid IANA time zone');
    }
  }

  private dateKey(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  /**
   * Finds the first UTC millisecond belonging to the terminal's next local
   * calendar day. Comparing formatted local date keys keeps this correct for
   * 23/25-hour DST days without maintaining a separate time-zone offset table.
   */
  private nextLocalMidnight(date: Date, timeZone: string): Date {
    const currentDateKey = this.dateKey(date, timeZone);
    let beforeBoundary = date.getTime();
    let afterBoundary = beforeBoundary + 30 * 60 * 60 * 1000;
    while (this.dateKey(new Date(afterBoundary), timeZone) === currentDateKey) {
      afterBoundary += 6 * 60 * 60 * 1000;
    }
    while (afterBoundary - beforeBoundary > 1) {
      const candidate = Math.floor((beforeBoundary + afterBoundary) / 2);
      if (this.dateKey(new Date(candidate), timeZone) === currentDateKey) {
        beforeBoundary = candidate;
      } else {
        afterBoundary = candidate;
      }
    }
    return new Date(afterBoundary);
  }

  private randomPairingCode(): string {
    const bytes = randomBytes(10);
    return Array.from(
      bytes,
      (byte) => PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length],
    ).join('');
  }

  private normalizePairingCode(value: string): string {
    const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 10)
      throw new UnauthorizedException('Invalid pairing code');
    return code;
  }

  private hashPairingCode(code: string): string {
    return createHmac('sha256', this.qrMasterSecret)
      .update(`openclockwork-pairing:v1:${code}`)
      .digest('hex');
  }

  private hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async recordFirstActivation(
    tx: Prisma.TransactionClient,
    at: Date,
  ): Promise<void> {
    await tx.terminalSupportPrompt.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, firstActivatedAt: at },
    });
  }

  private async lockEmployee(
    tx: Prisma.TransactionClient,
    employeeId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${employeeId}, 0))`;
  }

  private evaluateTerminalPosition(
    dto: ScanTerminalDto,
    terminal: Pick<
      Terminal,
      | 'enforceGeofence'
      | 'latitude'
      | 'longitude'
      | 'radiusMeters'
      | 'maxAccuracyMeters'
    >,
    now: Date,
  ): AcceptedTerminalPosition | null {
    if (!terminal.enforceGeofence) return null;
    if (
      dto.latitude === undefined ||
      dto.longitude === undefined ||
      dto.accuracyMeters === undefined ||
      dto.positionTimestamp === undefined
    ) {
      throw new BadRequestException({
        code: 'TERMINAL_GPS_REQUIRED',
        message: 'A fresh GPS position is required for terminal booking',
      });
    }
    if (
      terminal.latitude === null ||
      terminal.longitude === null ||
      terminal.radiusMeters === null ||
      terminal.maxAccuracyMeters === null
    ) {
      throw new ConflictException({
        code: 'TERMINAL_GEOFENCE_INCOMPLETE',
        message: 'The terminal geofence configuration is incomplete',
      });
    }
    const positionTimestamp = new Date(dto.positionTimestamp);
    this.assertFreshPosition(positionTimestamp, now);
    if (dto.accuracyMeters > terminal.maxAccuracyMeters) {
      throw new ForbiddenException({
        code: 'TERMINAL_GPS_INACCURATE',
        message: 'GPS accuracy is insufficient for terminal booking',
        accuracyMeters: dto.accuracyMeters,
        maxAccuracyMeters: terminal.maxAccuracyMeters,
      });
    }
    const distanceMeters = this.haversineMeters(
      dto.latitude,
      dto.longitude,
      Number(terminal.latitude),
      Number(terminal.longitude),
    );
    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters > terminal.radiusMeters
    ) {
      throw new ForbiddenException({
        code: 'TERMINAL_OUTSIDE_GEOFENCE',
        message: 'Current position is outside the terminal geofence',
        distanceMeters: Number.isFinite(distanceMeters)
          ? Math.round(distanceMeters)
          : null,
        radiusMeters: terminal.radiusMeters,
      });
    }
    return {
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracyMeters: dto.accuracyMeters,
      positionTimestamp,
      distanceMeters,
    };
  }

  private haversineMeters(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
  ): number {
    const radians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeters = 6_371_000;
    const deltaLatitude = radians(latitudeB - latitudeA);
    const deltaLongitude = radians(longitudeB - longitudeA);
    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(radians(latitudeA)) *
        Math.cos(radians(latitudeB)) *
        Math.sin(deltaLongitude / 2) ** 2;
    const clamped = Math.max(0, Math.min(1, a));
    return (
      earthRadiusMeters *
      2 *
      Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped))
    );
  }

  private assertFreshPosition(positionTimestamp: Date, now: Date): void {
    const ageMs = now.getTime() - positionTimestamp.getTime();
    if (!Number.isFinite(ageMs) || ageMs > 60_000 || ageMs < -5_000) {
      throw new ForbiddenException({
        code: 'TERMINAL_POSITION_STALE',
        message: 'A fresh GPS position is required for terminal booking',
      });
    }
  }

  private clampConfig(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const parsed = Number(this.config.get<string>(key, String(fallback)));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
  }

  private rateLimitException(code: string): HttpException {
    return new HttpException(
      { code, message: 'Too many terminal requests; try again shortly' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function localTodayAsUtcDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
