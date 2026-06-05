import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsUUID,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { OwnerEquityTransactionType } from "../../../database/entities/owner-equity-transaction.entity";

export class CreateOwnerEquityDto {
  @IsDateString()
  transactionDate: string;

  @IsEnum(OwnerEquityTransactionType)
  type: OwnerEquityTransactionType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateOwnerEquityDto {
  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsEnum(OwnerEquityTransactionType)
  type?: OwnerEquityTransactionType;

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
}

export class QueryOwnerEquityDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsEnum(OwnerEquityTransactionType)
  type?: OwnerEquityTransactionType;

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
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class OwnerEquityResponseDto {
  id: string;
  referenceNumber: string;
  transactionDate: Date;
  type: string;
  amount: number;
  paymentMethodId: string;
  paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  description?: string;
  status: string;
  journalEntryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class OwnerEquityListResponseDto {
  data: OwnerEquityResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
