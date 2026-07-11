import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('accounting_settings')
export class AccountingSettings {
  // Singleton: boolean PK constrained to true via migration CHECK (id = true).
  @PrimaryColumn({ type: 'boolean', default: true })
  id: boolean;

  @Column({ type: 'uuid' }) cashAccountId: string;
  @Column({ type: 'uuid' }) bankAccountId: string;
  @Column({ type: 'uuid' }) inventoryAccountId: string;
  @Column({ type: 'uuid' }) supplierDepositAccountId: string;
  @Column({ type: 'uuid' }) customerDepositAccountId: string;
  @Column({ type: 'uuid' }) openingBalanceEquityAccountId: string;
  @Column({ type: 'uuid' }) salesRevenueAccountId: string;
  @Column({ type: 'uuid' }) cogsAccountId: string;
  @Column({ type: 'uuid' }) defaultExpenseAccountId: string;
}
