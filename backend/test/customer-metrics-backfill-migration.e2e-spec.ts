import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { AppModule } from '../src/app.module';
import { RecalculateCustomerMetricsFromFulfilledOrders1791611629594 } from '../src/database/migrations/1791611629594-RecalculateCustomerMetricsFromFulfilledOrders';
import { configureTestAppValidation } from './utils/configure-test-app-validation';

const runId = randomUUID().slice(0, 8);
let app: INestApplication;
let ds: DataSource;
let orderSeq = 0;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);
});

afterAll(async () => {
  await app.close();
});

/** Every fixture lives in a transaction that is ALWAYS rolled back. */
async function inRolledBackTxn(fn: (qr: QueryRunner) => Promise<void>): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await fn(qr);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}

const up = (qr: QueryRunner) =>
  new RecalculateCustomerMetricsFromFulfilledOrders1791611629594().up(qr);

interface StoredMetrics {
  totalOrders: number;
  totalSales: string;
  first: string | null;
  last: string | null;
}

/** A customer whose stored metrics are deliberately wrong unless overridden. */
async function customer(
  qr: QueryRunner,
  tag: string,
  stored: StoredMetrics = {
    totalOrders: 99,
    totalSales: '9999.0000',
    first: '2020-01-01',
    last: '2020-12-31',
  },
): Promise<string> {
  const [row] = await qr.query(
    `INSERT INTO customers (name, type, "totalOrders", "totalSales", "firstPurchaseDate", "lastPurchaseDate")
     VALUES ($1, 'business', $2, $3, $4::date, $5::date) RETURNING id`,
    [`BF ${tag} ${runId}`, stored.totalOrders, stored.totalSales, stored.first, stored.last],
  );
  return row.id as string;
}

async function order(
  qr: QueryRunner,
  customerId: string,
  status: string,
  orderDate: string,
  total: string,
  deleted = false,
): Promise<void> {
  await qr.query(
    `INSERT INTO sales_orders ("orderNumber", "orderDate", "customerId", status, "totalAmount", "deletedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      `BF-${runId}-${++orderSeq}`,
      orderDate,
      customerId,
      status,
      total,
      deleted ? new Date() : null,
    ],
  );
}

async function stored(qr: QueryRunner, customerId: string): Promise<StoredMetrics> {
  const [row] = await qr.query(
    `SELECT "totalOrders", "totalSales",
            to_char("firstPurchaseDate", 'YYYY-MM-DD') AS first,
            to_char("lastPurchaseDate", 'YYYY-MM-DD') AS last
       FROM customers WHERE id = $1`,
    [customerId],
  );
  return {
    totalOrders: row.totalOrders,
    totalSales: row.totalSales,
    first: row.first,
    last: row.last,
  };
}

const RESET: StoredMetrics = { totalOrders: 0, totalSales: '0.0000', first: null, last: null };

describe('RecalculateCustomerMetricsFromFulfilledOrders (#1355)', () => {
  it('replaces stale values with the totals of the fulfilled orders', async () => {
    await inRolledBackTxn(async (qr) => {
      const id = await customer(qr, 'stale');
      await order(qr, id, 'FULFILLED', '2026-03-10', '250.5000');
      await order(qr, id, 'FULFILLED', '2026-01-05', '100.0000');
      await order(qr, id, 'FULFILLED', '2026-02-07', '49.5000');

      await up(qr);

      expect(await stored(qr, id)).toEqual({
        totalOrders: 3,
        totalSales: '400.0000',
        first: '2026-01-05',
        last: '2026-03-10',
      });
    });
  });

  it('resets a customer with no orders at all', async () => {
    await inRolledBackTxn(async (qr) => {
      const id = await customer(qr, 'none');
      await up(qr);
      expect(await stored(qr, id)).toEqual(RESET);
    });
  });

  it.each(['DRAFT', 'READY', 'CANCELLED'])(
    'resets a customer whose only order is %s',
    async (status) => {
      await inRolledBackTxn(async (qr) => {
        const id = await customer(qr, `only-${status}`);
        await order(qr, id, status, '2026-02-01', '70.0000');
        await up(qr);
        expect(await stored(qr, id)).toEqual(RESET);
      });
    },
  );

  it('counts only FULFILLED, non-deleted orders among mixed ones', async () => {
    await inRolledBackTxn(async (qr) => {
      const id = await customer(qr, 'mixed');
      await order(qr, id, 'FULFILLED', '2026-02-10', '100.0000');
      // Each of these would move a total or a date if it were counted.
      await order(qr, id, 'DRAFT', '2026-01-01', '1.0000');
      await order(qr, id, 'READY', '2026-01-02', '2.0000');
      await order(qr, id, 'CANCELLED', '2026-03-30', '4.0000');
      await order(qr, id, 'FULFILLED', '2026-03-31', '8.0000', true);

      await up(qr);

      expect(await stored(qr, id)).toEqual({
        totalOrders: 1,
        totalSales: '100.0000',
        first: '2026-02-10',
        last: '2026-02-10',
      });
    });
  });

  it('recalculates a soft-deleted customer too', async () => {
    await inRolledBackTxn(async (qr) => {
      const id = await customer(qr, 'deleted');
      await qr.query(`UPDATE customers SET "deletedAt" = now() WHERE id = $1`, [id]);
      await order(qr, id, 'FULFILLED', '2026-02-10', '100.0000');

      await up(qr);

      expect(await stored(qr, id)).toEqual({
        totalOrders: 1,
        totalSales: '100.0000',
        first: '2026-02-10',
        last: '2026-02-10',
      });
    });
  });

  it('keeps one customer out of another customer totals', async () => {
    await inRolledBackTxn(async (qr) => {
      const a = await customer(qr, 'a');
      const b = await customer(qr, 'b');
      await order(qr, a, 'FULFILLED', '2026-01-05', '10.0000');
      await order(qr, b, 'FULFILLED', '2026-03-10', '20.0000');
      await order(qr, b, 'FULFILLED', '2026-03-11', '30.0000');

      await up(qr);

      expect(await stored(qr, a)).toEqual({
        totalOrders: 1,
        totalSales: '10.0000',
        first: '2026-01-05',
        last: '2026-01-05',
      });
      expect(await stored(qr, b)).toEqual({
        totalOrders: 2,
        totalSales: '50.0000',
        first: '2026-03-10',
        last: '2026-03-11',
      });
    });
  });

  it('does not rewrite a customer whose stored metrics are already right', async () => {
    await inRolledBackTxn(async (qr) => {
      const right = await customer(qr, 'right', {
        totalOrders: 1,
        totalSales: '100.0000',
        first: '2026-02-10',
        last: '2026-02-10',
      });
      await order(qr, right, 'FULFILLED', '2026-02-10', '100.0000');
      const wrong = await customer(qr, 'wrong');
      // An UPDATE writes a new row version, which shows as a new tuple position.
      const tid = async (id: string) =>
        (await qr.query(`SELECT ctid::text AS t FROM customers WHERE id = $1`, [id]))[0].t;
      const before = { right: await tid(right), wrong: await tid(wrong) };

      await up(qr);

      expect(await tid(right)).toBe(before.right);
      expect(await tid(wrong)).not.toBe(before.wrong);
      expect(await stored(qr, wrong)).toEqual(RESET);
    });
  });

  it('holds a SHARE lock on sales_orders, so no order write can interleave', async () => {
    await inRolledBackTxn(async (qr) => {
      const held = async () =>
        (
          await qr.query(
            `SELECT mode FROM pg_locks
              WHERE pid = pg_backend_pid() AND locktype = 'relation'
                AND relation = 'sales_orders'::regclass AND granted`,
          )
        ).map((r: { mode: string }) => r.mode);

      expect(await held()).not.toContain('ShareLock');
      await up(qr);
      expect(await held()).toContain('ShareLock');
    });
  });
});
