import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.validator';
import {
  BankReconciliationStatus,
  SetupClassification,
} from '../entities/bank-reconciliation.entity';
import { BankReconciliationVersionLineRole } from '../entities/bank-reconciliation-version-line.entity';

export { BankReconciliationStatus, SetupClassification, BankReconciliationVersionLineRole };

const BALANCE_REGEX = /^-?\d+(\.\d{1,2})?$/;
const BALANCE_MESSAGE = 'Amount must be a valid signed number with at most 2 decimal places';

export class SetupChangeDto {
  @ApiProperty()
  @IsUUID()
  journalEntryLineId: string;

  @ApiProperty({ enum: SetupClassification })
  @IsEnum(SetupClassification)
  classification: SetupClassification;
}

export class CreateBankReconciliationDto {
  @ApiProperty()
  @IsUUID()
  bankAccountId: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsCalendarDate()
  periodFrom?: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsCalendarDate()
  periodTo: string;

  @ApiPropertyOptional({ example: '100.00' })
  @IsOptional()
  @Matches(BALANCE_REGEX, { message: BALANCE_MESSAGE })
  openingBalance?: string;

  @ApiProperty({ example: '100.00' })
  @Matches(BALANCE_REGEX, { message: BALANCE_MESSAGE })
  closingBalance: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  matchedLineIds: string[];

  @ApiPropertyOptional({ type: [SetupChangeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupChangeDto)
  setupChanges?: SetupChangeDto[];
}

export class UpdateBankReconciliationDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  lockVersion: number;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsCalendarDate()
  periodFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsCalendarDate()
  periodTo?: string;

  @ApiPropertyOptional({ example: '100.00' })
  @IsOptional()
  @Matches(BALANCE_REGEX, { message: BALANCE_MESSAGE })
  openingBalance?: string;

  @ApiPropertyOptional({ example: '100.00' })
  @IsOptional()
  @Matches(BALANCE_REGEX, { message: BALANCE_MESSAGE })
  closingBalance?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  matchedLineIds?: string[];

  @ApiPropertyOptional({ type: [SetupChangeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupChangeDto)
  setupChanges?: SetupChangeDto[];
}

export class LifecycleDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  lockVersion: number;
}

export class DraftContextDto {
  @ApiProperty()
  @IsUUID()
  bankAccountId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reconciliationId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsCalendarDate()
  periodFrom?: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsCalendarDate()
  periodTo: string;

  @ApiPropertyOptional({ example: '100.00' })
  @IsOptional()
  @Matches(BALANCE_REGEX, { message: BALANCE_MESSAGE })
  openingBalance?: string;

  @ApiPropertyOptional({ type: [SetupChangeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupChangeDto)
  setupChanges?: SetupChangeDto[];
}

export class EligibleLinesSearchDto extends DraftContextDto {
  @ApiProperty({ enum: ['checklist', 'setup'] })
  @IsIn(['checklist', 'setup'])
  view: 'checklist' | 'setup';

  @ApiPropertyOptional({ enum: SetupClassification })
  @IsOptional()
  @IsEnum(SetupClassification)
  classification?: SetupClassification;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PreviewDto extends DraftContextDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  matchedLineIds: string[];
}

export class ListBankReconciliationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsCalendarDate()
  periodFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsCalendarDate()
  periodTo?: string;

  @ApiPropertyOptional({ enum: BankReconciliationStatus })
  @IsOptional()
  @IsEnum(BankReconciliationStatus)
  status?: BankReconciliationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ReconciliationLinesQueryDto {
  @ApiPropertyOptional({ enum: BankReconciliationVersionLineRole })
  @IsOptional()
  @IsEnum(BankReconciliationVersionLineRole)
  role?: BankReconciliationVersionLineRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export interface ReconciliationLineDto {
  journalEntryLineId: string;
  journalEntryId: string;
  entryDate: string;
  journalNo: string;
  sourceType: string;
  sourceDocumentId: string | null;
  sourceRef: string | null;
  description: string | null;
  moneyIn: string;
  moneyOut: string;
  role: BankReconciliationVersionLineRole;
  prePeriod: boolean;
  classification: SetupClassification | null;
}

export interface ReconciliationSummaryDto {
  openingBalance: string;
  closingBalance: string;
  moneyIn: string;
  moneyOut: string;
  calculatedClosingBalance: string;
  difference: string;
  openingClearedNet: string | null;
  openingBalanceDifference: string | null;
  unclassifiedCount: number | null;
}

export interface BankReconciliationDto {
  id: string;
  reconciliationNo: string;
  sequenceNo: number;
  bankAccountId: string;
  bankAccount: { code: string; name: string; isActive: boolean; isBankAccount: boolean };
  periodFrom: string;
  periodTo: string;
  status: BankReconciliationStatus;
  reopened: boolean;
  currentVersionNo: number | null;
  lockVersion: number;
  completedAt: string | null;
  completedBy: string | null;
  isLatest: boolean;
  accountHasDraft: boolean;
  summary: ReconciliationSummaryDto;
}

export interface BankReconciliationDetailDto extends BankReconciliationDto {
  matched: ReconciliationLineDto[];
  classified: ReconciliationLineDto[];
}

export interface NextPeriodDto {
  sequenceNo: number;
  isFirst: boolean;
  periodFrom: string | null;
  openingBalance: string | null;
  blockedReason: string | null;
}

export interface SetupSummaryDto {
  prePeriodTotal: number;
  unclassifiedCount: number;
  clearedCount: number;
  outstandingCount: number;
  openingClearedNet: string;
  openingBalanceDifference: string;
}

export interface PreviewResultDto {
  matched: ReconciliationLineDto[];
  invalidMatched: ReconciliationLineDto[];
  invalidClassifications: ReconciliationLineDto[];
  setupSummary: SetupSummaryDto | null;
}
