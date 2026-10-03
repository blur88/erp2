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

import { BankReconciliationController } from './controllers/bank-reconciliation.controller';
import { BankReconciliationEligibilityService } from './services/bank-reconciliation-eligibility.service';
import { BankReconciliationService } from './services/bank-reconciliation.service';
import { BankReconciliationLifecycleService } from './services/bank-reconciliation-lifecycle.service';

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
  controllers: [BankReconciliationController],
  providers: [
    BankReconciliationEligibilityService,
    BankReconciliationService,
    BankReconciliationLifecycleService,
  ],
  exports: [
    BankReconciliationEligibilityService,
    BankReconciliationService,
    BankReconciliationLifecycleService,
  ],
})
export class BankReconciliationsModule {}
