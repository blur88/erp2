import { INestApplication } from '@nestjs/common';
import { createGlobalValidationPipe } from '../../src/common/validation/global-validation-pipe';

/**
 * Registers the production global validation pipe on an e2e test app.
 *
 * Call after `createNestApplication()` and before `app.init()`.
 *
 * Deliberately narrow: this registers the validation pipe and NOTHING else.
 * It is not a production bootstrap helper — the global `/api` prefix, the
 * security middleware, and static asset serving are out of scope (#970) and
 * remain each suite's own concern.
 */
export function configureTestAppValidation(app: INestApplication): void {
  app.useGlobalPipes(createGlobalValidationPipe());
}
