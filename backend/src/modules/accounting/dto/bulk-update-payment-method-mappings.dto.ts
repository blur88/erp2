import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateIf,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

export class PaymentMethodMappingItemDto {
  @IsUUID()
  paymentMethodId!: string;

  /*
   * null CLEARS the mapping. An empty string does NOT — @IsUUID rejects it.
   * The two must not be conflated: a select that silently submits '' would
   * otherwise delete a mapping the operator never touched.
   */
  @ValidateIf((o) => o.accountId !== null)
  @IsUUID()
  accountId!: string | null;
}

/**
 * Duplicate paymentMethodIds are not expressible with a stock decorator.
 * Rejecting them here makes it a 400 before any database work, rather than
 * letting the batch's outcome depend on entry order.
 */
@ValidatorConstraint({ name: 'NoDuplicatePaymentMethodIds', async: false })
export class NoDuplicatePaymentMethodIds implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return true; // @IsArray reports this
    const ids = value
      .map((v) => (v as { paymentMethodId?: unknown })?.paymentMethodId)
      .filter((id): id is string => typeof id === 'string');
    return new Set(ids).size === ids.length;
  }

  defaultMessage(): string {
    return 'mappings must not contain duplicate paymentMethodId values';
  }
}

export class BulkUpdatePaymentMethodMappingsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  // Explicit @Type is required — without it nested validation of the array
  // elements is unreliable.
  @Type(() => PaymentMethodMappingItemDto)
  @Validate(NoDuplicatePaymentMethodIds)
  mappings!: PaymentMethodMappingItemDto[];
}
