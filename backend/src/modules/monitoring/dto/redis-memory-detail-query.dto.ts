import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

/**
 * Normalizes in the DTO; never rejects.
 *
 * The spec requires clamping, not erroring — an operator pasting a malformed
 * range must get the default window, not a 400. Rejecting validators
 * (`@IsISO8601`, `@IsInt`, `@Min`) would contradict that, so unparseable
 * values are transformed to `undefined` here and the store applies its own
 * bounds from there.
 */
export class RedisMemoryDetailQueryDto {
  @IsOptional()
  @Transform(({ value }) => toDateOrUndefined(value))
  from?: Date;

  @IsOptional()
  @Transform(({ value }) => toDateOrUndefined(value))
  to?: Date;

  @IsOptional()
  @Transform(({ value }) => toPositiveIntOrUndefined(value))
  limit?: number;

  @IsOptional()
  @IsString()
  instanceId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  allInstances?: boolean;
}

function toDateOrUndefined(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toPositiveIntOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const truncated = Math.trunc(parsed);
  // The store clamps the upper bound; anything < 1 is meaningless, so it
  // falls back to the default rather than erroring.
  return truncated >= 1 ? truncated : undefined;
}
