import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Preserve lexical credentials even with the application's implicit conversion.
const exactString = () =>
  Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  );
export class IdentifyTerminalDto {
  @ApiProperty({ enum: ['PIN'] }) @IsIn(['PIN']) method!: 'PIN';
  @ApiProperty()
  @exactString()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  challengePayload!: string;
  @ApiProperty({
    description: 'Exact personal number, preserving leading zeros.',
  })
  @exactString()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  personalNo!: string;
  @ApiProperty({ minLength: 8, maxLength: 8, writeOnly: true })
  @exactString()
  @IsString()
  @Matches(/^\d{8}$/)
  pin!: string;
}
export class IdentifyChallengeDto {
  @ApiProperty() payload!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class IdentifyTerminalResultDto {
  @ApiProperty() grant!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['clock-in', 'clock-out'] }) action!:
    | 'clock-in'
    | 'clock-out';
  @ApiProperty() requiresLocation!: boolean;
}
export class BookTerminalDto {
  @ApiProperty()
  @exactString()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  grant!: string;
  @ApiProperty({ enum: ['clock-in', 'clock-out'] })
  @IsIn(['clock-in', 'clock-out'])
  action!: 'clock-in' | 'clock-out';
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;
  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  positionTimestamp?: string;
}
export class BookTerminalResultDto {
  @ApiProperty({ enum: ['TERMINAL_BOOKED'] }) code!: 'TERMINAL_BOOKED';
  @ApiProperty({ enum: ['clock-in', 'clock-out'] }) action!:
    | 'clock-in'
    | 'clock-out';
  @ApiProperty({ format: 'date-time' }) bookedAt!: string;
  @ApiProperty({ format: 'uuid' }) receiptId!: string;
}
export class TerminalCredentialStatusDto {
  @ApiProperty({ enum: ['PIN'] }) method!: 'PIN';
  @ApiProperty() isConfigured!: boolean;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: String, nullable: true }) lockedUntil!: string | null;
  @ApiProperty({ type: String, nullable: true }) updatedAt!: string | null;
}
export class ResetTerminalPinResultDto {
  @ApiProperty({
    description: 'One-time secret. Never cache or log this response.',
  })
  pin!: string;
  @ApiProperty({ type: TerminalCredentialStatusDto })
  credential!: TerminalCredentialStatusDto;
}
export class TerminalAuditQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,19}$/)
  cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() terminalId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional({ enum: ['QR', 'PIN'] })
  @IsOptional()
  @IsIn(['QR', 'PIN'])
  method?: 'QR' | 'PIN';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  result?: string;
}
export class TerminalAuditEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() sequence!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty() event!: string;
  @ApiProperty() result!: string;
  @ApiProperty({ type: String, nullable: true }) method!: string | null;
  @ApiProperty({ type: String, nullable: true }) action!: string | null;
  @ApiProperty({ type: String, nullable: true }) employeeId!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) terminalId!: string | null;
  @ApiProperty({ type: String, nullable: true }) deviceId!: string | null;
  @ApiProperty({ type: String, nullable: true }) terminalName!: string | null;
  @ApiProperty({ type: String, nullable: true }) locationLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) timeEntryId!: string | null;
}
export class TerminalAuditPageDto {
  @ApiProperty({ type: [TerminalAuditEventDto] })
  items!: TerminalAuditEventDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
