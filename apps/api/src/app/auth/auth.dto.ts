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

export interface LoginResponse {
  accessToken: string;
  employee: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}
