import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Syntactic validation only. A class-validator constraint is synchronous and
 * has no database access, so it cannot check `year` against the available
 * range — and the service deliberately does not either: a year outside the
 * data returns an all-zero report, which is the required no-activity
 * behavior. A malformed year is a 400; a well-formed one always returns a
 * report.
 */
export class ProfitAndLossQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  year: number;
}
