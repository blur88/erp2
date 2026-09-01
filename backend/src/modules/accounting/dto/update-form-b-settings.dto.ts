import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Lengths mirror the entity columns exactly (spec §4.5). A DTO cap wider than
 * its column produces a database error instead of a 400.
 *
 * businessCode is validated for SHAPE only — five digits. There is no
 * validation against a HASiL/MSIC catalogue: we do not have a complete one, and
 * a partial allow-list would reject valid codes.
 *
 * Every field is TRIMMED BEFORE validation, matching what the service persists
 * (form-b-settings.service.ts blankToNull). Without this the two disagree:
 * " 47111 " fails the five-digit pattern even though it would be stored as the
 * valid "47111", and a 255-character name with surrounding spaces fails
 * MaxLength despite fitting the column once trimmed. Validating a value the
 * service would never store rejects input that is in fact correct.
 */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateFormBSettingsDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(255)
  businessName?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  registrationNumber?: string;

  // An empty string survives the trim and is allowed through, so update() can
  // normalise it to NULL (an explicit "clear this override"); a non-blank value
  // must be exactly five digits.
  @IsOptional() @Transform(trim) @IsString() @Matches(/^(|\d{5})$/, {
    message: 'businessCode must be exactly 5 digits',
  })
  businessCode?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(150)
  activityType?: string;
}
