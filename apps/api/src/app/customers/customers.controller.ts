import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CustomerDto, UpsertCustomerDto } from './customers.dto';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOkResponse({ type: [CustomerDto] })
  list(
    @CurrentUser() user: JwtUser,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<CustomerDto[]> {
    return this.customers.list(user.id, includeInactive === 'true');
  }

  @Get(':id')
  @ApiOkResponse({ type: CustomerDto })
  get(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerDto> {
    return this.customers.get(user.id, id);
  }

  @Post()
  @ApiCreatedResponse({ type: CustomerDto })
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpsertCustomerDto,
  ): Promise<CustomerDto> {
    return this.customers.create(user, dto);
  }

  @Put(':id')
  @ApiOkResponse({ type: CustomerDto })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCustomerDto,
  ): Promise<CustomerDto> {
    return this.customers.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.customers.remove(user, id);
  }
}
