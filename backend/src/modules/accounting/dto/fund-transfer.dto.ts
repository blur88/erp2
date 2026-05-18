import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FundTransferStatus } from '../../../database/entities/fund-transfer.entity';

export class CreateFundTransferDto {
  @IsUUID()
  sourceAccountId: string;

  @IsUUID()
  destinationAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  transferDate: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateFundTransferDto {
  @IsOptional()
  @IsUUID()
  sourceAccountId?: string;

  @IsOptional()
  @IsUUID()
  destinationAccountId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class QueryFundTransfersDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  sourceAccountId?: string;

  @IsOptional()
  @IsUUID()
  destinationAccountId?: string;

  @IsOptional()
  @IsEnum(FundTransferStatus)
  status?: FundTransferStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}

type AccountSummary = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type JournalEntryLineSummary = {
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  memo?: string;
};

type JournalEntrySummary = {
  id: string;
  referenceNumber: string;
  status: string;
  lines?: JournalEntryLineSummary[];
};

export class FundTransferResponseDto {
  id: string;
  referenceNumber: string;
  transferDate: Date;
  amount: number;
  description?: string;
  status: FundTransferStatus;
  fiscalPeriodId: string;
  journalEntryId: string | null;
  sourceAccount: AccountSummary;
  destinationAccount: AccountSummary;
  journalEntry?: JournalEntrySummary;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export class FundTransferListResponseDto {
  data: FundTransferResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
