import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  IsNumber,
  IsUUID,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
  Max,
  IsDecimal,
  IsDateString,
  ArrayMinSize,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from "@nestjs/swagger";
import { JournalEntryStatus } from "../../../database/entities/journal-entry.entity";

// Journal Entry Line DTO
export class CreateJournalEntryLineDto {
  @ApiProperty({ description: "Chart of account ID" })
  @IsUUID()
  accountId: string;

  @ApiProperty({ description: "Debit amount", minimum: 0, default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  debitAmount: number;

  @ApiProperty({ description: "Credit amount", minimum: 0, default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  creditAmount: number;

  @ApiPropertyOptional({ description: "Line item memo/description" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;
}

export class UpdateJournalEntryLineDto extends PartialType(
  CreateJournalEntryLineDto,
) {
  @ApiPropertyOptional({ description: "Line ID (for updating existing lines)" })
  @IsOptional()
  @IsUUID()
  id?: string;
}

export class OpeningBalanceLineDto {
  @ApiProperty({ description: "Account ID" })
  @IsUUID()
  accountId: string;

  @ApiProperty({
    description: "Positive = debit, negative = credit",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  amount: number;
}

export class PostOpeningBalancesDto {
  @ApiProperty({
    description: "Opening balance date (typically first day of fiscal year)",
  })
  @IsDateString()
  asOfDate: string;

  @ApiProperty({
    description: "Account balances",
    type: [OpeningBalanceLineDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceLineDto)
  balances: OpeningBalanceLineDto[];

  @ApiProperty({
    description:
      "Equity account to use for balancing (e.g., Opening Balance Equity)",
  })
  @IsUUID()
  equityAccountId: string;
}

export class BulkOperationDto {
  @ApiProperty({ description: "Array of journal entry IDs" })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  ids: string[];
}

export class BulkOperationResultDto {
  @ApiProperty({ description: "Successfully processed entry IDs" })
  succeeded: string[];

  @ApiProperty({ description: "Failed entries with error messages" })
  failed: { id: string; error: string }[];
}

export class JournalEntryLineResponseDto {
  @ApiProperty({ description: "Line ID" })
  id: string;

  @ApiProperty({ description: "Journal entry ID" })
  journalEntryId: string;

  @ApiProperty({ description: "Chart of account ID" })
  accountId: string;

  @ApiProperty({ description: "Debit amount" })
  debitAmount: number;

  @ApiProperty({ description: "Credit amount" })
  creditAmount: number;

  @ApiPropertyOptional({ description: "Line item memo/description" })
  memo?: string;

  @ApiPropertyOptional({ description: "Account details" })
  account?: {
    id: string;
    code: string;
    name: string;
    type: string;
  };

  @ApiProperty({ description: "Creation date" })
  createdAt: Date;

  @ApiProperty({ description: "Last update date" })
  updatedAt: Date;
}

// Journal Entry DTOs
export class CreateJournalEntryDto {
  @ApiProperty({ description: "Transaction entry date", type: Date })
  @Type(() => Date)
  @IsDate()
  entryDate: Date;

  @ApiPropertyOptional({
    description: "Unique reference number (auto-generated if not provided)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceNumber?: string;

  @ApiProperty({ description: "Journal entry description", maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  description: string;

  @ApiProperty({ description: "Fiscal period ID" })
  @IsUUID()
  fiscalPeriodId: string;

  @ApiPropertyOptional({
    description: 'Source transaction type (e.g., "SALES_ORDER", "PAYMENT")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceType?: string;

  @ApiPropertyOptional({ description: "Source transaction ID" })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiProperty({
    description: "Journal entry lines",
    type: [CreateJournalEntryLineDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJournalEntryLineDto)
  lines: CreateJournalEntryLineDto[];
}

export class UpdateJournalEntryDto extends PartialType(
  OmitType(CreateJournalEntryDto, ["lines"] as const),
) {
  @ApiPropertyOptional({ description: "Transaction entry date", type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  entryDate?: Date;

  @ApiPropertyOptional({ description: "Unique reference number" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceNumber?: string;

  @ApiPropertyOptional({ description: "Journal entry description" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: "Fiscal period ID" })
  @IsOptional()
  @IsUUID()
  fiscalPeriodId?: string;

  @ApiPropertyOptional({ description: "Source transaction type" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceType?: string;

  @ApiPropertyOptional({ description: "Source transaction ID" })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({
    description: "Journal entry lines",
    type: [UpdateJournalEntryLineDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateJournalEntryLineDto)
  lines?: UpdateJournalEntryLineDto[];
}

export class QueryJournalEntriesDto {
  @ApiPropertyOptional({ description: "Page number", minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Items per page",
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: "Search term (reference number or description)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    description: "Filter by status",
    enum: JournalEntryStatus,
  })
  @IsOptional()
  @IsEnum(JournalEntryStatus)
  status?: JournalEntryStatus;

  @ApiPropertyOptional({ description: "Filter by fiscal period ID" })
  @IsOptional()
  @IsUUID()
  fiscalPeriodId?: string;

  @ApiPropertyOptional({ description: "Filter by source type" })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({ description: "Filter by source ID" })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({ description: "Filter by start date", type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ description: "Filter by end date", type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({
    description: "Sort field",
    enum: ["entryDate", "referenceNumber", "createdAt"],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: "Filter by comma-separated entry UUIDs" })
  @IsOptional()
  @Matches(/^[0-9a-f-]+(,[0-9a-f-]+)*$/i, {
    message: "ids must be a comma-separated list of UUIDs",
  })
  ids?: string;

  @ApiPropertyOptional({ description: "Sort direction", enum: ["ASC", "DESC"] })
  @IsOptional()
  @IsString()
  sortOrder?: "ASC" | "DESC";
}

export class JournalEntryResponseDto {
  @ApiProperty({ description: "Entry ID" })
  id: string;

  @ApiProperty({ description: "Transaction entry date", type: Date })
  entryDate: Date;

  @ApiProperty({ description: "Unique reference number" })
  referenceNumber: string;

  @ApiProperty({ description: "Journal entry description" })
  description: string;

  @ApiProperty({ description: "Entry status", enum: JournalEntryStatus })
  status: JournalEntryStatus;

  @ApiProperty({ description: "Fiscal period ID" })
  fiscalPeriodId: string;

  @ApiPropertyOptional({ description: "ID of the entry being reversed" })
  reversalOfId?: string;

  @ApiPropertyOptional({ description: "ID of the reversing entry" })
  reversedById?: string;

  @ApiPropertyOptional({ description: "Source transaction type" })
  sourceType?: string;

  @ApiPropertyOptional({ description: "Source transaction ID" })
  sourceId?: string;

  @ApiPropertyOptional({
    description: "Human-readable reference of the source document",
  })
  sourceRefNumber?: string;

  @ApiProperty({ description: "Whether entry is in DRAFT status" })
  isDraft: boolean;

  @ApiProperty({ description: "Whether entry is POSTED" })
  isPosted: boolean;

  @ApiProperty({ description: "Whether entry is REVERSED" })
  isReversed: boolean;

  @ApiProperty({ description: "Total debit amount" })
  totalDebits: number;

  @ApiProperty({ description: "Total credit amount" })
  totalCredits: number;

  @ApiProperty({ description: "Whether entry is balanced" })
  isBalanced: boolean;

  @ApiPropertyOptional({ description: "Fiscal period details" })
  fiscalPeriod?: {
    id: string;
    code: string;
    name: string;
    status: string;
  };

  @ApiPropertyOptional({
    description: "Journal entry lines",
    type: [JournalEntryLineResponseDto],
  })
  lines?: JournalEntryLineResponseDto[];

  @ApiPropertyOptional({ description: "Entry being reversed" })
  reversalOf?: JournalEntryResponseDto;

  @ApiPropertyOptional({ description: "Reversing entry" })
  reversedBy?: JournalEntryResponseDto;

  @ApiProperty({ description: "Creation date" })
  createdAt: Date;

  @ApiProperty({ description: "Last update date" })
  updatedAt: Date;

  @ApiPropertyOptional({ description: "Soft delete date" })
  deletedAt?: Date;
}

export class JournalEntryListResponseDto {
  @ApiProperty({
    description: "List of journal entries",
    type: [JournalEntryResponseDto],
  })
  data: JournalEntryResponseDto[];

  @ApiProperty({ description: "Pagination metadata" })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
