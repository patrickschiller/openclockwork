import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InstallationModule } from './installation/installation.module';
import { CustomersModule } from './customers/customers.module';
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
import { ProjectsModule } from './projects/projects.module';
import { ReportsModule } from './reports/reports.module';
import { RequestsModule } from './requests/requests.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { TerminalsModule } from './terminals/terminals.module';
import { ViolationsModule } from './violations/violations.module';
import { WorkSchedulesModule } from './work-schedules/work-schedules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    InstallationModule,
    CustomersModule,
    EventsModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
    EmployeesModule,
    WorkSchedulesModule,
    ProjectsModule,
    ReportsModule,
    TimeEntriesModule,
    TerminalsModule,
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
