import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankReconciliation } from './entities/bank-reconciliation.entity';
import { BankReconciliationLine } from './entities/bank-reconciliation-line.entity';
import { BankReconciliationSetupMark } from './entities/bank-reconciliation-setup-mark.entity';
import { BankReconciliationVersion } from './entities/bank-reconciliation-version.entity';
import { BankReconciliationVersionLine } from './entities/bank-reconciliation-version-line.entity';
import { AccountingModule } from '../accounting/accounting.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankReconciliation,
      BankReconciliationLine,
      BankReconciliationSetupMark,
      BankReconciliationVersion,
      BankReconciliationVersionLine,
    ]),
    AccountingModule,
    SettingsModule,
    AuditLogsModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class BankReconciliationsModule {}
