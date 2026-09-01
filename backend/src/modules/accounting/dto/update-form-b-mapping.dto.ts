// backend/src/modules/accounting/dto/update-form-b-mapping.dto.ts
import { IsIn, ValidateIf, IsString } from 'class-validator';
import { FormBExpenseCategory, FormBIncomeCategory } from '../entities/form-b-category.enum';

const ALL = [
  ...Object.values(FormBExpenseCategory),
  ...Object.values(FormBIncomeCategory),
] as string[];

/**
 * EXACTLY ONE field. Which enum it resolves against is derived from the
 * account's type, so an empty body and a both-fields-at-once body are
 * unrepresentable rather than rejected by a runtime cross-field check.
 *
 * null clears. Clearing is always explicit, never implied by omission.
 */
export class UpdateFormBMappingDto {
  @ValidateIf((o) => o.category !== null)
  @IsString()
  @IsIn(ALL, { message: `category must be null or one of: ${ALL.join(', ')}` })
  category!: string | null;
}
