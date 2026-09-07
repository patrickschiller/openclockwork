import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { Terminal, TerminalDevice } from '@prisma/client';
import { TimeEntryDto } from '../time-entries/time-entries.dto';

const MAX_LOGO_DATA_URL_LENGTH = 85_000;

export class CreateTerminalDto {
  @ApiProperty({ example: 'Haupteingang' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Zum Ein- oder Ausstempeln QR-Code scannen' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  displayText!: string;

  @ApiProperty({ example: 'Büro Würzburg – Empfang' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  locationLabel!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_LOGO_DATA_URL_LENGTH,
    description:
      'Same-origin path or a PNG/JPEG/WebP data URL (maximum 60 KiB decoded).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LOGO_DATA_URL_LENGTH)
  logoUrl?: string | null;

  @ApiPropertyOptional({
    default: true,
    description:
      'Require a fresh employee position inside the configured geofence.',
  })
  @IsOptional()
  @IsBoolean()
  enforceGeofence?: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 49.7913,
    minimum: -90,
    maximum: 90,
    description: 'Required unless enforceGeofence is false.',
  })
  @ValidateIf((dto: CreateTerminalDto) => dto.enforceGeofence !== false)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 9.9534,
    minimum: -180,
    maximum: 180,
    description: 'Required unless enforceGeofence is false.',
  })
  @ValidateIf((dto: CreateTerminalDto) => dto.enforceGeofence !== false)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    default: 100,
    minimum: 10,
    maximum: 1000,
  })
  @ValidateIf((dto: CreateTerminalDto) => dto.enforceGeofence !== false)
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1000)
  radiusMeters?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    default: 100,
    minimum: 5,
    maximum: 500,
  })
  @ValidateIf((dto: CreateTerminalDto) => dto.enforceGeofence !== false)
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(500)
  maxAccuracyMeters?: number | null;

  @ApiPropertyOptional({ default: 'UTC' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timeZone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTerminalDto extends PartialType(CreateTerminalDto) {}

export class TerminalDeviceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastSeenAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  revokedAt!: string | null;
}

export class TerminalDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  displayText!: string;

  @ApiProperty()
  locationLabel!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty()
  enforceGeofence!: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true })
  latitude!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  longitude!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  radiusMeters!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  maxAccuracyMeters!: number | null;

  @ApiProperty()
  timeZone!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isPaired!: boolean;

  @ApiProperty()
  deviceCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  activatedAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastSeenAt!: string | null;

  @ApiProperty({ type: [TerminalDeviceDto] })
  devices!: TerminalDeviceDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class PairingCodeDto {
  @ApiProperty({ example: 'ABC23-DEFG4' })
  pairingCode!: string;

  @ApiProperty({ example: '/kiosk?pairing=ABC23-DEFG4' })
  pairingUrl!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class PairTerminalDto {
  @ApiProperty({ example: 'ABC23-DEFG4' })
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  pairingCode!: string;

  @ApiPropertyOptional({ example: 'iPad Empfang' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class KioskTerminalDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  displayText!: string;

  @ApiProperty()
  locationLabel!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty()
  timeZone!: string;
}

export class PairedTerminalDto {
  @ApiProperty({
    description: 'Returned once. Persist securely in the kiosk browser.',
  })
  deviceToken!: string;

  @ApiProperty({ type: KioskTerminalDto })
  terminal!: KioskTerminalDto;
}

export class TerminalChallengeDto {
  @ApiProperty({
    description: 'Opaque value to encode into the displayed QR code.',
  })
  payload!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ minimum: 1, maximum: 50 })
  refreshAfterSeconds!: number;
}

export class KioskStateDto {
  @ApiProperty({ type: KioskTerminalDto })
  terminal!: KioskTerminalDto;

  @ApiProperty({ type: TerminalChallengeDto })
  challenge!: TerminalChallengeDto;

  @ApiProperty({ format: 'date-time' })
  serverTime!: string;
}

export class ScanTerminalDto {
  @ApiProperty({ description: 'Opaque QR payload emitted by the kiosk.' })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  qrPayload!: string;

  @ApiPropertyOptional({ enum: ['clock-in', 'clock-out'] })
  @IsOptional()
  @IsIn(['clock-in', 'clock-out'])
  action?: 'clock-in' | 'clock-out';

  @ApiPropertyOptional({ type: Number, minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ type: Number, minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Timestamp reported by the fresh browser geolocation reading.',
  })
  @IsOptional()
  @IsDateString()
  positionTimestamp?: string;
}

export class ScanTerminalResultDto {
  @ApiProperty({ enum: ['clock-in', 'clock-out'] })
  action!: 'clock-in' | 'clock-out';

  @ApiProperty({ type: TimeEntryDto })
  entry!: TimeEntryDto;

  @ApiPropertyOptional({ type: Number, nullable: true })
  distanceMeters!: number | null;
}

export class SupportPromptDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  shownAt!: string | null;
}

type TerminalWithDevices = Terminal & { devices: TerminalDevice[] };

export function toTerminalDto(terminal: TerminalWithDevices): TerminalDto {
  const activeDevices = terminal.devices.filter((device) => !device.revokedAt);
  const lastSeenAt = activeDevices.reduce<Date | null>((latest, device) => {
    if (!device.lastSeenAt) return latest;
    return !latest || device.lastSeenAt > latest ? device.lastSeenAt : latest;
  }, null);
  return {
    id: terminal.id,
    name: terminal.name,
    displayText: terminal.displayText,
    locationLabel: terminal.locationLabel,
    logoUrl: terminal.logoUrl,
    enforceGeofence: terminal.enforceGeofence,
    latitude: terminal.latitude === null ? null : Number(terminal.latitude),
    longitude: terminal.longitude === null ? null : Number(terminal.longitude),
    radiusMeters: terminal.radiusMeters,
    maxAccuracyMeters: terminal.maxAccuracyMeters,
    timeZone: terminal.timeZone,
    isActive: terminal.isActive,
    isPaired: activeDevices.length > 0,
    deviceCount: activeDevices.length,
    activatedAt: terminal.activatedAt?.toISOString() ?? null,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
    devices: terminal.devices.map((device) => ({
      id: device.id,
      name: device.name,
      createdAt: device.createdAt.toISOString(),
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      revokedAt: device.revokedAt?.toISOString() ?? null,
    })),
    createdAt: terminal.createdAt.toISOString(),
    updatedAt: terminal.updatedAt.toISOString(),
  };
}
