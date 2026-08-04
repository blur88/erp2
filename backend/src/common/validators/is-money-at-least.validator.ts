import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { toMinorUnits } from '@/common/utils/money';

/**
 * Validates that a monetary value is a canonical scale-4 decimal string no less
 * than `minimum`.
 *
 * Replaces `@Min(n)` for money, which cannot apply to a string. The comparison
 * runs in scale-4 minor units so it is exact — `@Min(0.01)` semantics are
 * preserved precisely, including rejecting 0.0001 through 0.0099.
 *
 * class-validator does not guarantee decorator execution order, so this cannot
 * assume a companion @Matches already screened the value. toMinorUnits throws on
 * malformed input, which would surface as a 500; catching here makes the
 * decorator independently sound and fail closed with a 400.
 */
export function IsMoneyAtLeast(minimum: string, options?: ValidationOptions) {
  const minimumMinor = toMinorUnits(minimum);

  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMoneyAtLeast',
      target: object.constructor,
      propertyName,
      constraints: [minimum],
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            return toMinorUnits(value) >= minimumMinor;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a decimal string of at least ${args.constraints[0]}`;
        },
      },
    });
  };
}
