import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertTerminalAdmin,
  lockTerminalSecurity,
} from './terminal-security-locks';
import type { TerminalAuditQueryDto } from './terminal-auth.dto';

export interface TerminalAuditInput {
  event: string;
  result: string;
  method?: 'QR' | 'PIN';
  action?: 'clock-in' | 'clock-out';
  employeeId?: string;
  actorId?: string;
  terminalId?: string;
  deviceId?: string;
  terminalName?: string;
  locationLabel?: string;
  timeEntryId?: string;
}

@Injectable()
export class TerminalAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get configured() {
    const key = this.config.get<string>('TERMINAL_AUDIT_KEY');
    return (
      !!key &&
      key.length >= 32 &&
      !['JWT_SECRET', 'TERMINAL_QR_SECRET', 'TERMINAL_PIN_PEPPER'].some(
        (name) => this.config.get<string>(name) === key,
      )
    );
  }

  async append(
    tx: Prisma.TransactionClient,
    input: TerminalAuditInput,
    required = true,
  ) {
    const key = this.config.get<string>('TERMINAL_AUDIT_KEY');
    if (!key || !this.configured) {
      if (!required) return null; // Unconfigured legacy QR installations continue their original flow.
      throw new ServiceUnavailableException({
        code: 'TERMINAL_AUDIT_UNAVAILABLE',
        message: 'Terminal audit is not configured',
      });
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261501)`;
    const last = await tx.terminalAuditEvent.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, hash: true },
    });
    const sequence = (last?.sequence ?? 0n) + 1n;
    const id = randomUUID();
    const occurredAt = new Date();
    const keyVersion =
      this.config.get<string>('TERMINAL_AUDIT_KEY_VERSION') ?? '1';
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(keyVersion))
      throw new ServiceUnavailableException('Invalid audit key version');
    // Explicit whitelist and fixed property order are the exported canonical v1 format.
    // Never spread a request body or Error object here.
    const fields = {
      id,
      occurredAt: occurredAt.toISOString(),
      event: input.event,
      result: input.result,
      method: input.method ?? null,
      action: input.action ?? null,
      employeeId: input.employeeId ?? null,
      actorId: input.actorId ?? null,
      terminalId: input.terminalId ?? null,
      deviceId: input.deviceId ?? null,
      terminalName: input.terminalName ?? null,
      locationLabel: input.locationLabel ?? null,
      timeEntryId: input.timeEntryId ?? null,
    };
    const canonicalPayload = JSON.stringify({
      format: 1,
      sequence: sequence.toString(),
      keyVersion,
      ...fields,
    });
    const previousHash = last?.hash ?? '0'.repeat(64);
    const hash = createHmac('sha256', key)
      .update(`${previousHash}\n${canonicalPayload}`)
      .digest('hex');
    return tx.terminalAuditEvent.create({
      data: {
        ...fields,
        occurredAt,
        sequence,
        canonicalPayload,
        previousHash,
        hash,
        keyVersion,
      },
    });
  }

  async failure(input: TerminalAuditInput, required = true) {
    await this.prisma.$transaction((tx) => this.append(tx, input, required));
  }

  async list(query: TerminalAuditQueryDto, actorId: string) {
    if (
      query.cursor &&
      (!/^\d{1,19}$/.test(query.cursor) ||
        BigInt(query.cursor) > 9223372036854775807n)
    )
      throw new BadRequestException('Invalid audit cursor');
    return this.prisma.$transaction(async (tx) => {
      await lockTerminalSecurity(tx);
      await assertTerminalAdmin(tx, actorId);
      const limit = query.limit ?? 25;
      const rows = await tx.terminalAuditEvent.findMany({
        where: {
          ...(query.cursor ? { sequence: { lt: BigInt(query.cursor) } } : {}),
          ...(query.terminalId ? { terminalId: query.terminalId } : {}),
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          ...(query.method ? { method: query.method } : {}),
          ...(query.result ? { result: query.result } : {}),
        },
        orderBy: { sequence: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          sequence: true,
          occurredAt: true,
          event: true,
          result: true,
          method: true,
          action: true,
          employeeId: true,
          actorId: true,
          terminalId: true,
          deviceId: true,
          terminalName: true,
          locationLabel: true,
          timeEntryId: true,
        },
      });
      await this.append(
        tx,
        { event: 'AuditViewed', result: 'SUCCESS', actorId },
        false,
      );
      return {
        items: rows
          .slice(0, limit)
          .map((row) => ({
            ...row,
            sequence: row.sequence.toString(),
            occurredAt: row.occurredAt.toISOString(),
          })),
        nextCursor:
          rows.length > limit ? rows[limit - 1].sequence.toString() : null,
      };
    });
  }
}
