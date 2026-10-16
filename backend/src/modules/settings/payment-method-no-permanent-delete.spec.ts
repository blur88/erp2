import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PaymentMethodController } from './controllers/payment-method.controller';
import { PaymentMethodService } from './services/payment-method.service';

/**
 * #1398 project 1: a payment method can no longer be permanently deleted, in the
 * route table or in the service. Soft delete, the deleted list and restore stay,
 * as an approved transition until project 8 ships retirement, so `remove` and
 * `restore` are asserted to exist: this guard is about the destroying path only,
 * and a guard that passed because the class was empty would prove nothing.
 */
describe('payment methods cannot be permanently deleted (#1398 project 1)', () => {
  const classes: Array<[string, { prototype: object }]> = [
    ['PaymentMethodService', PaymentMethodService],
    ['PaymentMethodController', PaymentMethodController],
  ];

  /** Every method a class has, its own and inherited. */
  function methodNames(target: { prototype: object }): string[] {
    const names = new Set<string>();
    for (
      let proto = target.prototype;
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    ) {
      Object.getOwnPropertyNames(proto).forEach((name) => names.add(name));
    }
    return [...names];
  }

  it.each(classes)('%s has no permanent-delete method', (_name, target) => {
    const names = methodNames(target);

    // The class was really inspected: the transition methods are still there.
    expect(names).toEqual(expect.arrayContaining(['remove', 'restore']));
    expect(names.filter((name) => /permanent/i.test(name))).toEqual([]);
  });

  it('the payment-method service source issues no hard delete', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/modules/settings/services/payment-method.service.ts'),
      'utf8',
    );

    // Repository .delete(...) and query-builder .delete(). The service's remove()
    // calls softDelete(, which none of these match, so the transition is allowed.
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.remove\(/);
    expect(src).not.toMatch(/\bDELETE\s+FROM\b/i); // raw SQL
  });

  it('the controller declares no permanent route', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/modules/settings/controllers/payment-method.controller.ts'),
      'utf8',
    );

    expect(src).not.toMatch(/permanent/i);
  });
});
