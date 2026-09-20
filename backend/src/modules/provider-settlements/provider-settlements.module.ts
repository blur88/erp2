import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderSettlement } from './entities/provider-settlement.entity';
import { ProviderSettlementLine } from './entities/provider-settlement-line.entity';
import { AccountingModule } from '../accounting/accounting.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProviderSettlement, ProviderSettlementLine]),
    AccountingModule, // exports ACCOUNTING_POSTING_PORT and the lookup service
    SettingsModule,
    AuditLogsModule,
  ],
  controllers: [],
  providers: [],
})
export class ProviderSettlementsModule {}
