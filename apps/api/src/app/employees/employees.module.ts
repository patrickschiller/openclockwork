import { ContractPeriodsController } from './contract-periods.controller';
import { ContractPeriodsService } from './contract-periods.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [AuthModule],
  controllers: [EmployeesController, ContractPeriodsController],
  providers: [EmployeesService, ContractPeriodsService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
