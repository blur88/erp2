import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
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
      .map((file) => ({ file: file.split(sep).join('/'), text: readFileSync(join(root, file), 'utf8') }));

    const queryBuilderDelete =
      /\.delete\(\s*\)\s*\.from\(\s*['"](stock_movements|purchase_cost_history)['"]/;
    const rawDelete = /DELETE\s+FROM\s+"?(stock_movements|purchase_cost_history)/i;
    const repositoryDelete =
      /(stockMovementRepo|costHistoryRepo|stockMovementRepository|costHistoryRepository|getRepository\(\s*(StockMovement|PurchaseCostHistory)\s*\))[\s\S]{0,80}\.delete\(/;

    const forbidden: Array<[string, RegExp]> = [
      ['a query-builder delete from stock_movements or purchase_cost_history', queryBuilderDelete],
      ['a raw DELETE FROM stock_movements or purchase_cost_history', rawDelete],
      ['a repository delete on a stock-movement or cost-history repository', repositoryDelete],
    ];

    /**
     * The one known exception: product permanent delete removes the product's
     * INITIAL_STOCK movement (single and bulk paths). It is owned by later
     * projects (#1406 removes it). Only these exact two statements are allowed,
     * and only for the repository pattern; anything else in the file fails.
     */
    const ALLOWLISTED_FILE = 'modules/inventory/services/product.service.ts';
    const ALLOWED_INITIAL_STOCK_DELETE =
      /this\.stockMovementRepository\.delete\(\{\s*productId: id,\s*movementType: StockMovementType\.INITIAL_STOCK,\s*\}\);/g;
    const ALLOWED_COUNT = 2;

    function withoutAllowed(file: string, text: string): string {
      return file === ALLOWLISTED_FILE ? text.replace(ALLOWED_INITIAL_STOCK_DELETE, '') : text;
    }

    it('reads the source tree', () => {
      expect(files.length).toBeGreaterThan(10);
    });

    it.each(forbidden)('each pattern detects %s in a fixture', (_what, pattern) => {
      const fixtures: Record<string, string> = {
        [queryBuilderDelete.source]: "qb.delete().from('stock_movements').where('x')",
        [rawDelete.source]: 'await manager.query(`DELETE FROM "purchase_cost_history" WHERE 1=1`)',
        [repositoryDelete.source]: 'await this.costHistoryRepository.delete(batch.id)',
      };
      expect(pattern.test(fixtures[pattern.source])).toBe(true);
      expect(pattern.test('await this.productRepository.delete(id)')).toBe(false);
    });

    it.each(forbidden)('no file has %s outside the known exception', (_what, pattern) => {
      const offenders = files
        .filter(({ file, text }) => pattern.test(withoutAllowed(file, text)))
        .map(({ file }) => file);
      expect(offenders).toEqual([]);
    });

    it(`the known exception is exactly ${ALLOWED_COUNT} INITIAL_STOCK deletes in ${ALLOWLISTED_FILE}`, () => {
      const productFile = files.find(({ file }) => file === ALLOWLISTED_FILE);
      expect(productFile).toBeDefined();
      expect(productFile!.text.match(ALLOWED_INITIAL_STOCK_DELETE) ?? []).toHaveLength(
        ALLOWED_COUNT,
      );
    });
  });
});
