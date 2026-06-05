import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsUUID,
  IsArray,
  Min,
  MaxLength,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export class CreateExpenseDto {
  @IsDateString()
  expenseDate: string;

  @IsUUID()
  expenseAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  vendor?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsUUID()
  expenseAccountId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  vendor?: string;
}

export class QueryExpenseDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsUUID()
  expenseAccountId?: string;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  includeDeleted?: boolean;
}

export class BulkExpenseDto {
  @IsArray()
  @IsUUID("4", { each: true })
  ids: string[];
}

export class ExpenseResponseDto {
  id: string;
  referenceNumber: string;
  expenseDate: Date;
  expenseAccountId: string;
  expenseAccount?: {
    id: string;
    code: string;
    name: string;
  };
  amount: number;
  paymentMethodId: string;
  paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  description?: string;
  vendor?: string;
  status: string;
  journalEntryId?: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ExpenseListResponseDto {
  data: ExpenseResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
