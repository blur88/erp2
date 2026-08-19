import { IsString, IsOptional, IsUUID, IsNotEmpty, MaxLength, Matches, ValidateNested, ArrayMinSize, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.validator';

export class CreateExpenseDto {
  @IsCalendarDate()
  expenseDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  payee?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @IsUUID()
  expenseAccountId: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'totalAmount must be a positive decimal string' })
  totalAmount: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class ExpensePaymentRowDto {
  @IsUUID()
  paymentMethodId: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount: string;

  @IsCalendarDate()
  paymentDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class PayExpenseDto {
  @ValidateNested({ each: true })
  @Type(() => ExpensePaymentRowDto)
  @ArrayMinSize(1)
  payments: ExpensePaymentRowDto[];
}

export class ExpenseRefundRowDto {
  @IsUUID()
  paymentMethodId: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount: string;

  @IsCalendarDate()
  refundDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class RefundExpenseDto {
  @ValidateNested({ each: true })
  @Type(() => ExpenseRefundRowDto)
  @ArrayMinSize(1)
  refunds: ExpenseRefundRowDto[];
}

export class ListExpensesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsCalendarDate()
  fromDate?: string;

  @IsOptional()
  @IsCalendarDate()
  toDate?: string;

  @IsOptional()
  @IsUUID()
  expenseAccountId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'COMPLETED', 'CANCELLED'])
  documentStatus?: 'DRAFT' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @IsIn(['UNPAID', 'PARTIAL', 'PAID', 'OVERPAID'])
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';

  @IsOptional()
  @IsIn(['expenseNumber', 'expenseDate', 'totalAmount'])
  sortBy?: 'expenseNumber' | 'expenseDate' | 'totalAmount';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
