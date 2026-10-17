import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StockMovementService } from './services/stock-movement.service';
import { BaseCostCalculatorService } from './services/base-cost-calculator.service';
import { StockController } from './controllers/stock.controller';
import { StockMovement } from '../../database/entities/stock-movement.entity';

/**
 * #1398 P4 stage 0: known stock-history deletion patterns stay removed.
 *
 * This guards the known patterns only; it is not proof that no other deletion
 * path exists (cascades, raw SQL in other forms, triggers).
 */
describe('known stock-history deletion patterns stay removed (#1398 P4 stage 0)', () => {
  const classes = {
    StockMovementService,
    BaseCostCalculatorService,
    StockController,
  };

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

  const forbiddenMethods = [
    'reverseMovement',
    'deleteByReference',
    'deleteByMultipleReferences',
    'recalculateBalances',
    'removeStock',
    'restoreStock',
  ];

  it.each(Object.entries(classes))(
    '%s has none of the forbidden stock-history deletion methods',
    (_name, target) => {
      const names = methodNames(target as any);
      expect(names.some((name) => /^(create|find|get|add|reduce|record)/.test(name))).toBe(
        true,
      );
      for (const forbidden of forbiddenMethods) {
        expect(names).not.toContain(forbidden);
      }
    },
  );

  it('StockMovement.prototype has no reverse helper', () => {
    expect(Object.prototype.hasOwnProperty.call(StockMovement.prototype, 'reverse')).toBe(
      false,
    );
    expect((StockMovement.prototype as any).reverse).toBeUndefined();
  });

  describe('source', () => {
    const root = join(process.cwd(), 'src');
    const files = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }));

    const forbidden: Array<[string, RegExp]> = [
      [
        'a query-builder delete from stock_movements or purchase_cost_history',
        /\.delete\(\s*\)\s*\.from\(\s*['"](stock_movements|purchase_cost_history)['"]/,
      ],
      [
        'a raw DELETE FROM stock_movements or purchase_cost_history',
        /DELETE\s+FROM\s+"?(stock_movements|purchase_cost_history)/i,
      ],
      [
        'a repository delete on a stock-movement or cost-history repository',
        /(stockMovementRepo|costHistoryRepo|stockMovementRepository|costHistoryRepository|getRepository\(\s*(StockMovement|PurchaseCostHistory)\s*\))[\s\S]{0,80}\.delete\(/,
      ],
    ];

    it('reads the source tree', () => {
      expect(files.length).toBeGreaterThan(10);
    });

    it.each(forbidden)('no file (outside the allowlist) has %s', (_what, pattern) => {
      const offenders = files
        .filter(({ file }) => !file.endsWith('product.service.ts'))
        .filter(({ text }) => pattern.test(text))
        .map(({ file }) => file);
      expect(offenders).toEqual([]);
    });

    it('the allowlisted product.service.ts still contains the known stock-movement delete', () => {
      const productFile = files.find(({ file }) => file.endsWith('product.service.ts'));
      expect(productFile).toBeDefined();
      expect(
        /(stockMovementRepo|costHistoryRepo|stockMovementRepository|costHistoryRepository|getRepository\(\s*(StockMovement|PurchaseCostHistory)\s*\))[\s\S]{0,80}\.delete\(/.test(
          productFile!.text,
        ),
      ).toBe(true);
      expect(productFile!.text).toContain('INITIAL_STOCK');
    });
  });
});
