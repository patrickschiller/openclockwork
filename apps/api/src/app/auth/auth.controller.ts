import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshDto,
  UpdatePreferencesDto,
  type EmployeeProfile,
  type LoginResponse,
  type RefreshResponse,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { JwtUser } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<RefreshResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtUser): Promise<EmployeeProfile> {
    return this.auth.getProfile(user.id);
  }

  @Patch('me/preferences')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updatePreferences(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<EmployeeProfile> {
    return this.auth.updatePreferences(user.id, dto.themePreference);
  }
}
