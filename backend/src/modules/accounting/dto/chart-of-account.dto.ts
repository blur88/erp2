import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsArray,
  ArrayNotEmpty,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AccountType } from '../../../database/entities/chart-of-account.entity';

export class CreateChartOfAccountDto {
  @ApiProperty({ description: 'Unique account code (e.g., "1000", "4000")', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'Account name (e.g., "Cash", "Sales Revenue")', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Account type',
    enum: AccountType,
    example: AccountType.ASSET
  })
  @IsEnum(AccountType)
  type: AccountType;

  @ApiPropertyOptional({ description: 'Parent account ID (for hierarchical accounts)' })
  @IsOptional()
  @IsUUID(4)
  parentId?: string;

  @ApiPropertyOptional({ description: 'Whether the account is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the account is eligible for cash/bank fund transfers',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isCashEquivalent?: boolean;
}

export class UpdateChartOfAccountDto extends PartialType(CreateChartOfAccountDto) {
  @ApiPropertyOptional({ description: 'Unique account code', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Account name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Account type', enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;
}

export class QueryChartOfAccountsDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 500, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search term (account code or name)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by account type', enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by parent account ID' })
  @IsOptional()
  @IsUUID(4)
  parentId?: string;

  @ApiPropertyOptional({ description: 'Filter by cash/bank accounts eligible for fund transfers' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isCashEquivalent?: boolean;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['code', 'name', 'type', 'createdAt'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

export class ChartOfAccountResponseDto {
  @ApiProperty({ description: 'Account ID' })
  id: string;

  @ApiProperty({ description: 'Account code' })
  code: string;

  @ApiProperty({ description: 'Account name' })
  name: string;

  @ApiProperty({ description: 'Account type', enum: AccountType })
  type: AccountType;

  @ApiPropertyOptional({ description: 'Parent account ID' })
  parentId?: string;

  @ApiProperty({ description: 'Whether the account is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Whether the account is eligible for cash/bank fund transfers' })
  isCashEquivalent: boolean;

  @ApiProperty({ description: 'Full hierarchical code (e.g., "1000-1010")' })
  fullCode: string;

  @ApiProperty({ description: 'Whether account has children' })
  isParent: boolean;

  @ApiPropertyOptional({ description: 'Parent account details' })
  parent?: Partial<ChartOfAccountResponseDto>;

  @ApiPropertyOptional({ description: 'Child accounts', type: [ChartOfAccountResponseDto] })
  children?: ChartOfAccountResponseDto[];

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Soft delete date' })
  deletedAt?: Date;
}

export class ChartOfAccountListResponseDto {
  @ApiProperty({ description: 'List of accounts', type: [ChartOfAccountResponseDto] })
  data: ChartOfAccountResponseDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export class ChartOfAccountHierarchyDto {
  @ApiProperty({ description: 'Hierarchical tree structure', type: [ChartOfAccountResponseDto] })
  data: ChartOfAccountResponseDto[];

  @ApiProperty({ description: 'Hierarchy metadata' })
  meta: {
    totalAccounts: number;
    accountsByType: Record<AccountType, number>;
    maxDepth: number;
  };
}

export class BulkChartOfAccountsDto {
  @ApiProperty({
    description: 'Array of account IDs for bulk operations',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(4, { each: true })
  accountIds: string[];
}

export class QueryRecentActivityDto {
  @ApiPropertyOptional({ description: 'Number of recent entries to return', minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class RecentActivityItemDto {
  @ApiProperty({ description: 'Journal entry date' })
  date: string;

  @ApiProperty({ description: 'Journal entry reference number' })
  reference: string;

  @ApiProperty({ description: 'Journal entry description' })
  description: string;

  @ApiPropertyOptional({ description: 'Debit amount (null if credit entry)' })
  debit: number | null;

  @ApiPropertyOptional({ description: 'Credit amount (null if debit entry)' })
  credit: number | null;
}
