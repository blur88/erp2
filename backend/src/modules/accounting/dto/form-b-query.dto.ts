// backend/src/modules/accounting/dto/form-b-query.dto.ts
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Syntactic validation only, mirroring ProfitAndLossQueryDto. A well-formed
 * year always returns a report: one outside the ledger's range yields an
 * all-zero skeleton, which is the required no-activity behaviour, and a year
 * other than the form version raises FORM_VERSION_MISMATCH rather than a 400.
 */
export class FormBQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  year: number;
}
