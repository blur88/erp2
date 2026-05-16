import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  IsNumber,
  IsUUID,
  IsArray,
  IsBoolean,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BankReconciliationStatus } from '../../../database/entities/bank-reconciliation.entity';

// Create DTO
export class CreateBankReconciliationDto {
  @ApiProperty({ description: 'Bank/Cash account ID (Chart of Account)' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ description: 'Fiscal period ID' })
  @IsUUID()
  fiscalPeriodId: string;

  @ApiProperty({ description: 'Reconciliation date', type: Date })
  @Type(() => Date)
  @IsDate()
  reconciliationDate: Date;

  @ApiProperty({ description: 'Balance per bank statement' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  statementBalance: number;
}

// Update DTO
export class UpdateBankReconciliationDto {
  @ApiPropertyOptional({ description: 'Bank/Cash account ID (Chart of Account)' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Fiscal period ID' })
  @IsOptional()
  @IsUUID()
  fiscalPeriodId?: string;

  @ApiPropertyOptional({ description: 'Reconciliation date', type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  reconciliationDate?: Date;

  @ApiPropertyOptional({ description: 'Balance per bank statement' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  statementBalance?: number;
}

// Query DTO
export class QueryBankReconciliationsDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by account ID' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Filter by fiscal period ID' })
  @IsOptional()
  @IsUUID()
  fiscalPeriodId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: BankReconciliationStatus })
  @IsOptional()
  @IsEnum(BankReconciliationStatus)
  status?: BankReconciliationStatus;

  @ApiPropertyOptional({ description: 'Search by account name, account code, or fiscal period name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by reconciliation date (from), e.g. 2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by reconciliation date (to), e.g. 2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by balanced status (difference = 0 when true)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isBalanced?: boolean;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['reconciliationDate', 'createdAt'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

// Mark/unmark cleared DTO
export class ToggleClearedDto {
  @ApiProperty({ description: 'Journal entry line IDs to toggle', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  journalEntryLineIds: string[];
}

// Response DTOs
export class ReconciledTransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  reconciliationId: string;

  @ApiProperty()
  journalEntryLineId: string;

  @ApiProperty()
  cleared: boolean;

  @ApiPropertyOptional()
  journalEntryLine?: {
    id: string;
    journalEntryId: string;
    accountId: string;
    debitAmount: number;
    creditAmount: number;
    memo: string;
    account?: { id: string; code: string; name: string; type: string };
    journalEntry?: { id: string; referenceNumber: string; entryDate: Date; description: string };
  };

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class BankReconciliationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  accountId: string;

  @ApiProperty()
  fiscalPeriodId: string;

  @ApiProperty()
  reconciliationDate: Date;

  @ApiProperty()
  statementBalance: number;

  @ApiProperty()
  bookBalance: number;

  @ApiProperty()
  difference: number;

  @ApiProperty({ enum: BankReconciliationStatus })
  status: BankReconciliationStatus;

  @ApiProperty()
  isCompleted: boolean;

  @ApiProperty()
  isInProgress: boolean;

  @ApiProperty()
  isBalanced: boolean;

  @ApiPropertyOptional()
  account?: { id: string; code: string; name: string; type: string };

  @ApiPropertyOptional()
  fiscalPeriod?: { id: string; code: string; name: string; status: string };

  @ApiPropertyOptional({ type: [ReconciledTransactionResponseDto] })
  reconciledTransactions?: ReconciledTransactionResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class BankReconciliationListResponseDto {
  @ApiProperty({ type: [BankReconciliationResponseDto] })
  data: BankReconciliationResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
