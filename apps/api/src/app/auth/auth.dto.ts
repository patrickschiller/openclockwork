import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

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
