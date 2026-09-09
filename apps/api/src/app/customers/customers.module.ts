import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
