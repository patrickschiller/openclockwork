import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

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
  @ApiProperty({ description: 'A refresh token previously returned from /auth/login or /auth/refresh.' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  employee: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
