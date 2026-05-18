import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AbsencesModule } from './absences/absences.module';
import { AccountsModule } from './accounts/accounts.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { ErpExportModule } from './erp-export/erp-export.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { LeaveAllowancesModule } from './leave-allowances/leave-allowances.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RequestsModule } from './requests/requests.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ViolationsModule } from './violations/violations.module';
import { WorkSchedulesModule } from './work-schedules/work-schedules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventsModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
    EmployeesModule,
    WorkSchedulesModule,
    TimeEntriesModule,
    LeaveAllowancesModule,
    AccountsModule,
    RequestsModule,
    AbsencesModule,
    AttachmentsModule,
    ViolationsModule,
    ErpExportModule,
  ],
})
export class AppModule {}
