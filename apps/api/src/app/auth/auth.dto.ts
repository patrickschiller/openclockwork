import { ApiProperty } from '@nestjs/swagger';
import { ThemePreference } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'hannah.roth@openclockwork.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'openclockwork' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({
    description:
      'A refresh token previously returned from /auth/login or /auth/refresh.',
  })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class UpdatePreferencesDto {
  @ApiProperty({
    enum: ThemePreference,
    enumName: 'ThemePreference',
    description:
      'Light / Dark / System. System follows the OS color-scheme media query in the browser.',
  })
  @IsEnum(ThemePreference)
  themePreference!: ThemePreference;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;
  @ApiProperty() @IsString() @MinLength(12) @MaxLength(72) newPassword!: string;
}

export class UpdateOwnProfileDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) lastName!: string;
  @ApiProperty() @IsEmail() @MaxLength(200) email!: string;
}

export interface EmployeeProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  themePreference: ThemePreference;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  employee: EmployeeProfile;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
