import { IsOptional, IsUUID } from 'class-validator';

export class UpdateAccountingSettingsDto {
  @IsOptional() @IsUUID() cashAccountId?: string;
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @IsUUID() inventoryAccountId?: string;
  @IsOptional() @IsUUID() supplierDepositAccountId?: string;
  @IsOptional() @IsUUID() customerDepositAccountId?: string;
  @IsOptional() @IsUUID() openingBalanceEquityAccountId?: string;
  @IsOptional() @IsUUID() salesRevenueAccountId?: string;
  @IsOptional() @IsUUID() cogsAccountId?: string;
  @IsOptional() @IsUUID() defaultExpenseAccountId?: string;
}
