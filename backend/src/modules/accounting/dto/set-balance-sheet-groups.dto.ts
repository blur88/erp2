import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsUUID,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { BalanceSheetGroup } from '../services/balance-sheet-groups.resolve';

export class BalanceSheetGroupItemDto {
  @IsUUID()
  accountId!: string;

  @IsEnum(BalanceSheetGroup)
  group!: BalanceSheetGroup;
}

/**
 * Duplicate accountIds are not expressible with a stock decorator. Rejecting
 * them here makes it a 400 before any database work, rather than letting the
 * outcome depend on entry order. The service repeats the check because it is a
 * domain invariant, not merely request hygiene.
 */
@ValidatorConstraint({ name: 'NoDuplicateGroupAccountIds', async: false })
export class NoDuplicateGroupAccountIds implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return true; // @IsArray reports this
    const ids = value
      .map((v) => (v as { accountId?: unknown })?.accountId)
      .filter((id): id is string => typeof id === 'string');
    return new Set(ids).size === ids.length;
  }

  defaultMessage(): string {
    return 'groups must not contain duplicate accountId values';
  }
}

/**
 * REPLACEMENT semantics: `groups` is the complete set, not a patch.
 *
 * Deliberately NOT @ArrayNotEmpty, unlike the payment-method mapping DTO: an
 * empty array is the only way to express "clear every grouping", which re-arms
 * both fallbacks and is a legitimate configuration.
 */
export class SetBalanceSheetGroupsDto {
  @IsArray()
  @ValidateNested({ each: true })
  // Explicit @Type is required — without it nested validation of the array
  // elements is unreliable.
  @Type(() => BalanceSheetGroupItemDto)
  @Validate(NoDuplicateGroupAccountIds)
  groups!: BalanceSheetGroupItemDto[];
}
