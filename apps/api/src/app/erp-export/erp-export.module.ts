import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ErpExportController } from './erp-export.controller';
import { ErpExportService } from './erp-export.service';

@Module({
  controllers: [ErpExportController],
  providers: [ErpExportService, ApiKeyGuard],
})
export class ErpExportModule {}
