import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Lengths mirror the entity columns exactly (spec §4.5). A DTO cap wider than
 * its column produces a database error instead of a 400.
 *
 * businessCode is validated for SHAPE only — five digits. There is no
 * validation against a HASiL/MSIC catalogue: we do not have a complete one, and
 * a partial allow-list would reject valid codes.
 */
export class UpdateFormBSettingsDto {
  @IsOptional() @IsString() @MaxLength(255)
  businessName?: string;

  @IsOptional() @IsString() @MaxLength(50)
  registrationNumber?: string;

  // Allows an all-whitespace string through so update() can normalise it to
  // null; a non-blank value must be exactly five digits.
  @IsOptional() @IsString() @Matches(/^(\s*|\d{5})$/, {
    message: 'businessCode must be exactly 5 digits',
  })
  businessCode?: string;

  @IsOptional() @IsString() @MaxLength(150)
  activityType?: string;
}
