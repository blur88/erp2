import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Syntactic validation only, mirroring ProfitAndLossQueryDto. The FUTURE-year
 * bound is deliberately NOT here: a class-validator constraint is synchronous
 * with no database access, so it cannot resolve "this year" from Regional
 * Settings. BalanceSheetService enforces it against the same business date it
 * computes with, and returns 400 there.
 */
export class BalanceSheetQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  year: number;
}
