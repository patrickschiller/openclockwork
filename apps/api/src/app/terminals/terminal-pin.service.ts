import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TerminalAuditService } from './terminal-audit.service';

@Injectable()
export class TerminalPinService implements OnModuleInit {
  private dummyHash?: Promise<string>;
  constructor(
    private readonly config: ConfigService,
    private readonly audit: TerminalAuditService,
    private readonly prisma: PrismaService,
  ) {}
  async onModuleInit() {
    if (this.config.get<string>('NODE_ENV') !== 'production' || !this.available)
      return;
    const rows = await this.prisma.$queryRaw<
      Array<{ unsafe: boolean; canAppend: boolean }>
    >`
      SELECT (r.rolsuper OR r.rolcreaterole OR pg_has_role(current_user, c.relowner, 'MEMBER')
        OR pg_has_role(current_user, n.nspowner, 'MEMBER')
        OR pg_has_role(current_user, d.datdba, 'MEMBER')
        OR has_table_privilege(current_user, c.oid, 'UPDATE')
        OR has_table_privilege(current_user, c.oid, 'DELETE')
        OR has_table_privilege(current_user, c.oid, 'TRUNCATE')) AS "unsafe",
        (has_table_privilege(current_user, c.oid, 'INSERT') AND has_table_privilege(current_user, c.oid, 'SELECT')) AS "canAppend"
      FROM pg_class c JOIN pg_roles r ON r.rolname = current_user
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_database d ON d.datname = current_database()
      WHERE c.oid = to_regclass('"TerminalAuditEvent"')`;
    if (rows.length !== 1 || rows[0].unsafe || !rows[0].canAppend)
      throw new Error(
        'Terminal PIN requires a separate runtime database role with only SELECT/INSERT on TerminalAuditEvent, without audit, schema or database ownership, owner-role membership, superuser or CREATEROLE privileges. Run migrations with the separate migration role.',
      );
  }
  get version() {
    return this.config.get<string>('TERMINAL_PIN_PEPPER_VERSION') ?? '1';
  }
  get available() {
    return !!this.pepper(this.version) && this.audit.configured;
  }
  assertAvailable() {
    if (!this.available)
      throw new ServiceUnavailableException({
        code: 'TERMINAL_PIN_UNAVAILABLE',
        message: 'Terminal PIN is not configured',
      });
  }
  generate() {
    return String(randomInt(0, 100_000_000)).padStart(8, '0');
  }
  private pepper(version: string): string | undefined {
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(version)) return undefined;
    let secret: unknown;
    if (version === this.version)
      secret = this.config.get<string>('TERMINAL_PIN_PEPPER');
    else {
      try {
        const previous = JSON.parse(
          this.config.get<string>('TERMINAL_PIN_PREVIOUS_PEPPERS') ?? '{}',
        ) as Record<string, unknown>;
        secret = Object.prototype.hasOwnProperty.call(previous, version)
          ? previous[version]
          : undefined;
      } catch {
        return undefined;
      }
    }
    return typeof secret === 'string' &&
      secret.length >= 32 &&
      !['JWT_SECRET', 'TERMINAL_QR_SECRET', 'TERMINAL_AUDIT_KEY'].some(
        (name) => this.config.get<string>(name) === secret,
      )
      ? secret
      : undefined;
  }
  private input(pin: string, version: string) {
    const secret = this.pepper(version);
    if (!secret) return null;
    return createHmac('sha256', secret)
      .update(`openclockwork-terminal-pin:v1:${pin}`)
      .digest();
  }
  async hash(pin: string) {
    this.assertAvailable();
    const input = this.input(pin, this.version);
    if (!input)
      throw new ServiceUnavailableException('Terminal PIN key unavailable');
    return argon2.hash(input, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }
  async verify(pin: string, encoded?: string, version?: string) {
    this.assertAvailable();
    const input = version ? this.input(pin, version) : null;
    if (!encoded || !input) {
      this.dummyHash ??= this.hash('00000000');
      const dummyInput = this.input(pin, this.version);
      if (!dummyInput)
        throw new ServiceUnavailableException('Terminal PIN key unavailable');
      await argon2.verify(await this.dummyHash, dummyInput);
      return false;
    }
    try {
      return await argon2.verify(encoded, input);
    } catch {
      return false;
    }
  }
}
