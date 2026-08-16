import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Product } from '../src/database/entities/product.entity';
import { StockMovement, StockMovementType } from '../src/database/entities/stock-movement.entity';
import { StockMovementService } from '../src/modules/inventory/services/stock-movement.service';
import { seedCategory, seedProduct } from './e2e/helpers/seed';

/**
 * Cross-workflow stock concurrency (#1076).
 *
 * Before the stock-mutation contract, every writer read `stockQuantity` without
 * a row lock and then wrote an absolute value. Two concurrent movements read the
 * same starting balance and the later commit silently discarded the earlier one,
 * while both `stock_movements` rows persisted — so the ledger disagreed with the
 * product.
 *
 * These tests drive real concurrent transactions against PostgreSQL. They cannot
 * be written against mocks: an in-process double has no row locks, so a mocked
 * version passes with the locking removed.
 */
describe('Stock concurrency (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let movements: StockMovementService;
  let categoryId: string;

  // seedProduct()'s default name is a shared counter (`Test Product N`) and this
  // suite runs against the same database as every other e2e spec, so those
  // defaults collide with another suite's products on UQ_products_lower_name.
  // Names are namespaced per suite AND per call — a full-suite-only failure
  // otherwise (see project_new_unique_index_breaks_shared_seed_helper).
  let productSeq = 0;
  const uniqueName = () => `stock-concurrency ${process.pid} ${++productSeq}`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    movements = app.get(StockMovementService);
    categoryId = (await seedCategory(ds)).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const stockOf = async (productId: string): Promise<number> => {
    const p = await ds.getRepository(Product).findOneOrFail({ where: { id: productId } });
    return Number(p.stockQuantity);
  };

  const movementsFor = async (productId: string): Promise<StockMovement[]> =>
    ds.getRepository(StockMovement).find({
      where: { productId },
      order: { createdAt: 'ASC' },
    });

  it('serialises two concurrent decrements without losing an update', async () => {
    const product = await seedProduct(ds, categoryId, { name: uniqueName(), stockQuantity: 100 });

    // Both start from stockQuantity = 100. Unlocked, both would compute 90 and
    // the final balance would be 90 instead of 80.
    await Promise.all([
      movements.create({
        productId: product.id,
        movementType: StockMovementType.ADJUSTMENT_DECREASE,
        quantity: -10,
        referenceType: 'test',
        referenceId: product.id,
        reason: 'concurrent A',
      } as any),
      movements.create({
        productId: product.id,
        movementType: StockMovementType.ADJUSTMENT_DECREASE,
        quantity: -10,
        referenceType: 'test',
        referenceId: product.id,
        reason: 'concurrent B',
      } as any),
    ]);

    expect(await stockOf(product.id)).toBe(80);
  });

  it('records a movement ledger that agrees with the final product balance', async () => {
    const product = await seedProduct(ds, categoryId, { name: uniqueName(), stockQuantity: 50 });

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        movements.create({
          productId: product.id,
          movementType: StockMovementType.ADJUSTMENT_DECREASE,
          quantity: -2,
          referenceType: 'test',
          referenceId: product.id,
          reason: `ledger ${i}`,
        } as any),
      ),
    );

    const rows = await movementsFor(product.id);
    expect(rows).toHaveLength(5);

    // The chain must be contiguous: each movement's previousBalance equals the
    // prior movement's newBalance. An unlocked read breaks this even when the
    // final total happens to look right.
    const chained = [...rows].sort((a, b) => a.newBalance - b.newBalance);
    for (let i = 1; i < chained.length; i++) {
      expect(Number(chained[i].newBalance)).toBe(Number(chained[i - 1].previousBalance));
    }

    const finalStock = await stockOf(product.id);
    expect(finalStock).toBe(40);
    // The lowest newBalance in the ledger is the final balance.
    expect(Math.min(...rows.map((r) => Number(r.newBalance)))).toBe(finalStock);
  });

  it('serialises an increase against a decrease (receipt vs adjustment)', async () => {
    const product = await seedProduct(ds, categoryId, { name: uniqueName(), stockQuantity: 20 });

    await Promise.all([
      movements.create({
        productId: product.id,
        movementType: StockMovementType.PURCHASE_RECEIPT,
        quantity: 30,
        referenceType: 'test',
        referenceId: product.id,
        reason: 'receipt',
      } as any),
      movements.create({
        productId: product.id,
        movementType: StockMovementType.ADJUSTMENT_DECREASE,
        quantity: -5,
        referenceType: 'test',
        referenceId: product.id,
        reason: 'adjustment',
      } as any),
    ]);

    // 20 + 30 - 5, in either order.
    expect(await stockOf(product.id)).toBe(45);
  });

  it('keeps concurrent movements on DIFFERENT products independent', async () => {
    // Guards against over-locking: two products must not serialise on each
    // other, or throughput collapses under load.
    const a = await seedProduct(ds, categoryId, { name: uniqueName(), stockQuantity: 10 });
    const b = await seedProduct(ds, categoryId, { name: uniqueName(), stockQuantity: 10 });

    await Promise.all([
      movements.create({
        productId: a.id,
        movementType: StockMovementType.ADJUSTMENT_DECREASE,
        quantity: -4,
        referenceType: 'test',
        referenceId: a.id,
        reason: 'product A',
      } as any),
      movements.create({
        productId: b.id,
        movementType: StockMovementType.ADJUSTMENT_DECREASE,
        quantity: -7,
        referenceType: 'test',
        referenceId: b.id,
        reason: 'product B',
      } as any),
    ]);

    expect(await stockOf(a.id)).toBe(6);
    expect(await stockOf(b.id)).toBe(3);
  });

  it('rejects a concurrent decrement that would go negative, rather than losing it', async () => {
    const product = await seedProduct(ds, categoryId, { name: uniqueName(), stockQuantity: 5 });

    const results = await Promise.allSettled([
      movements.create({
        productId: product.id,
        movementType: StockMovementType.ADJUSTMENT_DECREASE,
        quantity: -4,
        referenceType: 'test',
        referenceId: product.id,
        reason: 'first',
      } as any),
      movements.create({
        productId: product.id,
        movementType: StockMovementType.ADJUSTMENT_DECREASE,
        quantity: -4,
        referenceType: 'test',
        referenceId: product.id,
        reason: 'second',
      } as any),
    ]);

    // One succeeds; the other sees the post-lock balance of 1 and is refused.
    // Unlocked, both read 5, both "succeed", and stock lands at -3.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await stockOf(product.id)).toBe(1);
  });
});
