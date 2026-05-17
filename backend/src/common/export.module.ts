import { Module } from '@nestjs/common';
import { ExportService } from './services/export.service';
import { SettingsModule } from '../modules/settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
