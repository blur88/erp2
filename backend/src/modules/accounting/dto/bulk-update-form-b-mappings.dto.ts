// backend/src/modules/accounting/dto/bulk-update-form-b-mappings.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { UpdateFormBMappingDto } from './update-form-b-mapping.dto';

/**
 * Extends the single-row DTO rather than restating its decorators, so the
 * category rules cannot drift between the two routes.
 */
export class FormBMappingUpdateItemDto extends UpdateFormBMappingDto {
  @IsUUID()
  accountId!: string;
}

/**
 * Duplicate accountIds are not expressible with a stock decorator. Rejecting
 * them here makes it a 400 before any database work, rather than a
 * last-write-wins surprise inside the transaction.
 */
@ValidatorConstraint({ name: 'NoDuplicateAccountIds', async: false })
export class NoDuplicateAccountIds implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return true; // @IsArray reports this
    const ids = value
      .map((v) => (v as { accountId?: unknown })?.accountId)
      .filter((id): id is string => typeof id === 'string');
    return new Set(ids).size === ids.length;
  }

  defaultMessage(): string {
    return 'mappings must not contain duplicate accountId values';
  }
}

/**
 * An object wrapping the array, not a bare array: it keeps the route
 * extensible and works with the standard ValidationPipe without ParseArrayPipe.
 */
export class BulkUpdateFormBMappingsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  // Explicit @Type is required — without it nested validation and
  // transformation of the array elements are unreliable.
  @Type(() => FormBMappingUpdateItemDto)
  @Validate(NoDuplicateAccountIds)
  mappings!: FormBMappingUpdateItemDto[];
}
