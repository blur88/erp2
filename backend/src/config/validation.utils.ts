/**
 * Security-hardened input validation utilities for configuration values
 */

/**
 * Security-hardened input validation for integer configuration values
 * @param value - The value to validate and parse
 * @param defaultValue - Default value if input is invalid
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fieldName - Name of the field for error reporting
 * @returns Validated integer value
 */
export function validateAndParseInt(
  value: string | undefined,
  defaultValue: string,
  min: number,
  max: number,
  fieldName: string,
): number {
  const parsed = parseInt(value || defaultValue, 10);

  if (isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${fieldName}: must be between ${min} and ${max}`);
  }

  return parsed;
}
