import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { ViolationsController } from './violations.controller';
import { ViolationsService } from './violations.service';

@Module({
  imports: [EmployeesModule],
  controllers: [ViolationsController],
  providers: [ViolationsService],
})
export class ViolationsModule {}
