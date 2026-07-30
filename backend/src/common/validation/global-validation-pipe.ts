import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { extractValidationMessages } from '../utils/validation-errors.util';

/**
 * The single definition of the global validation pipe used in production.
 *
 * `main.ts` and the e2e test bootstraps both call this so that tests exercise
 * the validation behavior production actually runs (issue #970).
 *
 * Returns a new instance per call — a test app and the production app must
 * never share pipe state.
 *
 * This must stay unconditional: no test-aware branches, flags, or parameters.
 * A test that needs different validation behavior is reporting a real
 * production/test divergence, not a reason to parameterise this factory.
 */
export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true, // Remove non-whitelisted properties
    forbidNonWhitelisted: false, // Allow unknown query parameters (changed from true)
    skipMissingProperties: true, // Allow optional properties to be missing
    skipNullProperties: false,
    skipUndefinedProperties: false,
    disableErrorMessages: false, // Always show detailed validation errors for debugging
    validationError: {
      target: false, // Don't expose the target object in error messages
      value: false, // Don't expose the invalid value in error messages
    },
    exceptionFactory: (errors) => {
      const messages = extractValidationMessages(errors);
      return new BadRequestException(`Validation failed: ${messages.join(', ')}`);
    },
  });
}
