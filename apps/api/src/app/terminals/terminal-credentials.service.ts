import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TerminalPinService } from './terminal-pin.service';
import { TerminalAuditService } from './terminal-audit.service';
import {
  assertTerminalAdmin,
  lockTerminalSecurity,
} from './terminal-security-locks';
import type { TerminalCredentialStatusDto } from './terminal-auth.dto';

@Injectable()
export class TerminalCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pins: TerminalPinService,
    private readonly audit: TerminalAuditService,
  ) {}
  private async context(
    tx: Prisma.TransactionClient,
    employeeId: string,
    actorId: string,
  ) {
    await lockTerminalSecurity(tx, employeeId);
    await assertTerminalAdmin(tx, actorId);
    if (
      !(await tx.employee.findUnique({
        where: { id: employeeId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Employee not found');
  }
  private async status(
    tx: Prisma.TransactionClient,
    employeeId: string,
  ): Promise<TerminalCredentialStatusDto> {
    const row = await tx.terminalCredential.findUnique({
      where: { employeeId },
    });
    const state = await tx.terminalAuthAttemptState.findUnique({
      where: { key: `pin:${employeeId}` },
    });
    return {
      method: 'PIN',
      isConfigured: !!row,
      enabled: !!row && !row.revokedAt,
      lockedUntil:
        state?.lockedUntil && state.lockedUntil > new Date()
          ? state.lockedUntil.toISOString()
          : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }
  async get(employeeId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.context(tx, employeeId, actorId);
      return this.status(tx, employeeId);
    });
  }
  async reset(employeeId: string, actorId: string) {
    this.pins.assertAvailable();
    const pin = this.pins.generate();
    const pinHash = await this.pins.hash(pin);
    const credential = await this.prisma.$transaction(async (tx) => {
      await this.context(tx, employeeId, actorId);
      await tx.terminalCredential.upsert({
        where: { employeeId },
        create: { employeeId, pinHash, pepperVersion: this.pins.version },
        update: {
          pinHash,
          pepperVersion: this.pins.version,
          revokedAt: null,
          version: { increment: 1 },
        },
      });
      await tx.terminalAuthAttemptState.deleteMany({
        where: { key: `pin:${employeeId}` },
      });
      await this.audit.append(tx, {
        event: 'PinReset',
        result: 'SUCCESS',
        method: 'PIN',
        employeeId,
        actorId,
      });
      return this.status(tx, employeeId);
    });
    return { pin, credential };
  }
  async change(employeeId: string, actorId: string, unlock: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await this.context(tx, employeeId, actorId);
      const credential = await tx.terminalCredential.findUnique({
        where: { employeeId },
      });
      if (!credential || (unlock && credential.revokedAt))
        throw new NotFoundException('Active PIN credential not found');
      await tx.terminalCredential.update({
        where: { employeeId },
        data: {
          version: { increment: 1 },
          ...(unlock ? {} : { revokedAt: new Date() }),
        },
      });
      await tx.terminalAuthAttemptState.deleteMany({
        where: { key: `pin:${employeeId}` },
      });
      await this.audit.append(tx, {
        event: unlock ? 'PinUnlocked' : 'PinRevoked',
        result: 'SUCCESS',
        method: 'PIN',
        employeeId,
        actorId,
      });
      return this.status(tx, employeeId);
    });
  }
}
