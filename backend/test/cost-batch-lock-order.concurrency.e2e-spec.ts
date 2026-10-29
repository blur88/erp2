import { AsyncLocalStorage } from "node:async_hooks";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { jest } from "@jest/globals";
import { DataSource, EntityManager, QueryRunner } from "typeorm";
import { AppModule } from "../src/app.module";
import { Customer } from "../src/database/entities/customer.entity";
import { Product } from "../src/database/entities/product.entity";
import { PurchaseCostHistory } from "../src/database/entities/purchase-cost-history.entity";
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from "../src/database/entities/purchase-order.entity";
import { PurchaseOrderItem } from "../src/database/entities/purchase-order-item.entity";
import {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderPaymentStatus,
} from "../src/database/entities/sales-order.entity";
import { SalesOrderItem } from "../src/database/entities/sales-order-item.entity";
import { Supplier } from "../src/database/entities/supplier.entity";
import { BaseCostCalculatorService } from "../src/modules/inventory/services/base-cost-calculator.service";
import { PurchaseOrderLifecycleService } from "../src/modules/purchasing/services/purchase-order-lifecycle.service";
import { InventoryIntegrationService } from "../src/modules/sales/services/inventory-integration.service";
import { SalesOrderFulfillmentService } from "../src/modules/sales/services/sales-order-fulfillment.service";
import { seedCategory, seedProduct } from "./e2e/helpers/seed";
import { resetSuiteBusinessRows } from "./utils/shared-e2e-business-fixture";
import { removeSuiteTraces } from "./utils/shared-e2e-traces-fixture";

// The issue's agreed seam is the real transition service + PostgreSQL. Spies
// only schedule real queries; they never supply quantities or replace writes.
describe("Cost batch lock order (#1498, PostgreSQL)", () => {
  let app: INestApplication;
  let ds: DataSource;
  let sales: SalesOrderFulfillmentService;
  let purchasing: PurchaseOrderLifecycleService;
  let categoryId: string;
  const productIds: string[] = [];
  const customerIds: string[] = [];
  const supplierIds: string[] = [];
  const documentIds: string[] = [];
  const runId = `${process.pid}-${Date.now().toString(36)}`;
  let sequence = 0;
  const unique = () => `batch-${runId}-${++sequence}`;

  type Operation = {
    pid?: number;
    afterQuery?: (sql: string) => Promise<void>;
  };
  const context = new AsyncLocalStorage<Operation>();
  const activeRunners = new Map<QueryRunner, Operation>();
  const releases: (() => void)[] = [];
  const tasks: Promise<unknown>[] = [];

  async function bounded<T>(
    promise: Promise<T>,
    description: string,
    ms = 10000,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Timed out: ${description}`)),
            ms,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  }

  function barrier() {
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
      release = resolve;
    });
    releases.push(release);
    return {
      reached: () => bounded(reached, "query barrier was not reached"),
      release,
      hold: async () => {
        entered();
        await bounded(resumed, "query barrier was not released");
      },
    };
  }

  function start(operation: Operation, action: () => Promise<unknown>) {
    // Attach a rejection handler immediately, including on the unfixed base.
    const task = context.run(operation, action).then(
      () => ({ status: "committed" }),
      (error) => ({
        status: "rejected",
        code: error.driverError?.code ?? error.code,
        message: error.message,
      }),
    );
    tasks.push(task);
    return task;
  }

  async function blockedBy(waiter: Operation, holder: Operation) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (waiter.pid && holder.pid) {
        const [row] = await ds.query(
          `SELECT wait_event_type, pg_blocking_pids(pid) AS blockers
             FROM pg_stat_activity WHERE pid = $1`,
          [waiter.pid],
        );
        if (
          row?.wait_event_type === "Lock" &&
          row.blockers.includes(holder.pid)
        )
          return;
      }
      // Yield to the transactions; elapsed time is never treated as evidence
      // of a lock. The only successful exit is the database observation above.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error("No PostgreSQL lock wait on the expected transaction");
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    sales = app.get(SalesOrderFulfillmentService);
    purchasing = app.get(PurchaseOrderLifecycleService);
    const costs = app.get(BaseCostCalculatorService);
    // These services must exercise one real calculator, not detached doubles.
    expect((sales as any).baseCostCalculator).toBe(costs);
    expect((purchasing as any).baseCostCalculator).toBe(costs);
    expect(
      (app.get(InventoryIntegrationService) as any).baseCostCalculator,
    ).toBe(costs);
    categoryId = (await seedCategory(ds, unique())).id;
  });

  beforeEach(() => {
    const createRunner = ds.createQueryRunner.bind(ds);
    jest.spyOn(ds, "createQueryRunner").mockImplementation((mode) => {
      const runner = createRunner(mode);
      const operation = context.getStore();
      if (!operation) return runner;
      const query = runner.query.bind(runner);
      const release = runner.release.bind(runner);
      activeRunners.set(runner, operation);
      runner.release = async () => {
        activeRunners.delete(runner);
        return release();
      };
      runner.query = async (...args: Parameters<QueryRunner["query"]>) => {
        const result = await query(...args);
        if (args[0] === "START TRANSACTION") {
          const [row] = await query("SELECT pg_backend_pid() AS pid");
          operation.pid = row.pid;
          await query("SET LOCAL statement_timeout = '15s'");
        }
        await operation.afterQuery?.(args[0]);
        return result;
      };
      return runner;
    });
  });

  afterEach(async () => {
    releases.splice(0).forEach((release) => release());
    try {
      await bounded(
        Promise.allSettled(tasks),
        "transactions did not finish",
        18000,
      );
    } finally {
      // Failure cleanup terminates only still-owned connections, before mocks
      // and fixture rows are removed. Never terminate an idle pooled backend.
      for (const operation of activeRunners.values()) {
        if (operation.pid)
          await ds.query("SELECT pg_terminate_backend($1)", [operation.pid]);
      }
      await bounded(
        Promise.allSettled(tasks.splice(0)),
        "terminated transactions did not finish",
      );
      activeRunners.clear();
      jest.restoreAllMocks();
    }
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const journals: { id: string }[] = await ds.query(
        `SELECT id FROM journal_entry WHERE "sourceDocumentId" = ANY($1)`,
        [documentIds],
      );
      await removeSuiteTraces(ds, {
        entityIds: [
          categoryId,
          ...productIds,
          ...customerIds,
          ...supplierIds,
          ...documentIds,
          ...journals.map((j) => j.id),
        ],
      });
      await ds.query(
        `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1)`,
        [documentIds],
      );
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        customerIds,
        supplierIds,
        productIds,
      });
      expect(
        await ds
          .getRepository(PurchaseCostHistory)
          .count({ where: productIds.map((productId) => ({ productId })) }),
      ).toBe(0);
    }
    await app?.close();
  });

  async function product(quantity = 100) {
    const row = await seedProduct(ds, categoryId, {
      name: unique(),
      stockQuantity: quantity,
      baseCost: 10,
    });
    productIds.push(row.id);
    const repo = ds.getRepository(PurchaseCostHistory);
    await repo.save(
      repo.create({
        productId: row.id,
        unitCost: 10,
        shippingPerUnit: 0,
        landedCost: 10,
        receivedQuantity: quantity,
        remainingQuantity: quantity,
        receivedDate: new Date(),
      }),
    );
    return row;
  }

  async function readyOrder(products: Product[], quantity: number) {
    const customers = ds.getRepository(Customer);
    const customer = await customers.save(customers.create({ name: unique() }));
    customerIds.push(customer.id);
    const repo = ds.getRepository(SalesOrder);
    const total = String(products.length * quantity * 20);
    const order = await repo.save(
      repo.create({
        orderNumber: unique(),
        orderDate: new Date(),
        customerId: customer.id,
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
        subtotal: Number(total),
        totalAmount: total,
        paidAmount: total,
        balanceDue: "0",
      }),
    );
    documentIds.push(order.id);
    const items = ds.getRepository(SalesOrderItem);
    for (const [index, p] of products.entries()) {
      await items.save(
        items.create({
          salesOrderId: order.id,
          productId: p.id,
          lineNumber: index + 1,
          quantity,
          unitPrice: 20,
          unitCost: 10,
          totalAmount: quantity * 20,
        }),
      );
    }
    return order;
  }

  async function balances(p: Product) {
    const stock = await ds.getRepository(Product).findOneByOrFail({ id: p.id });
    const batches = await ds
      .getRepository(PurchaseCostHistory)
      .findBy({ productId: p.id });
    return {
      stock: Number(stock.stockQuantity),
      batches: batches.reduce((sum, b) => sum + Number(b.remainingQuantity), 0),
    };
  }

  async function expectSalesState(id: string, status: SalesOrderStatus) {
    expect(
      (await ds.getRepository(SalesOrder).findOneByOrFail({ id })).status,
    ).toBe(status);
    const [row] = await ds.query(
      `SELECT count(*)::int AS count FROM stock_movements WHERE "referenceId" = $1 AND "referenceType" = 'sales_order'`,
      [id],
    );
    expect(row.count).toBe(status === SalesOrderStatus.FULFILLED ? 1 : 0);
  }

  it("A: unfulfil and fulfil finish without a product/batch deadlock", async () => {
    const p = await product();
    const c = await readyOrder([p], 5);
    await sales.fulfillOrder(c.id);
    const a = await readyOrder([p], 3);
    const gate = barrier();
    const undo: Operation = {
      afterQuery: async (sql) => {
        if (sql.startsWith('UPDATE "purchase_cost_history"')) await gate.hold();
      },
    };
    const fulfill: Operation = {};
    const first = start(undo, () => sales.unfulfillOrder(c.id));
    await gate.reached(); // B restored; unfulfil has not yet written product base cost.
    const second = start(fulfill, () => sales.fulfillOrder(a.id));
    await blockedBy(fulfill, undo); // Base: batch. Fixed: product. Both are meaningful.
    gate.release();
    expect(await bounded(Promise.all([first, second]), "A completion")).toEqual(
      [{ status: "committed" }, { status: "committed" }],
    );
    await expectSalesState(c.id, SalesOrderStatus.READY);
    await expectSalesState(a.id, SalesOrderStatus.FULFILLED);
    expect(await balances(p)).toEqual({ stock: 97, batches: 97 });
  }, 25000);

  it("B: unfulfil preserves a concurrent fulfil depletion (97, not 100)", async () => {
    const p = await product();
    const c = await readyOrder([p], 5);
    await sales.fulfillOrder(c.id);
    const a = await readyOrder([p], 3);
    const gate = barrier();
    const fulfill: Operation = {
      afterQuery: async (sql) => {
        if (sql.startsWith('UPDATE "purchase_cost_history"')) await gate.hold();
      },
    };
    const undo: Operation = {};
    const first = start(fulfill, () => sales.fulfillOrder(a.id));
    await gate.reached(); // 92 uncommitted; another unlocked read still sees 95.
    const second = start(undo, () => sales.unfulfillOrder(c.id));
    await blockedBy(undo, fulfill); // Base: absolute batch UPDATE. Fixed: product lock.
    gate.release();
    expect(await bounded(Promise.all([first, second]), "B completion")).toEqual(
      [{ status: "committed" }, { status: "committed" }],
    );
    expect(await balances(p)).toEqual({ stock: 97, batches: 97 });
    await expectSalesState(c.id, SalesOrderStatus.READY);
    await expectSalesState(a.id, SalesOrderStatus.FULFILLED);
  }, 25000);

  it("C: purchase return and fulfil finish without a product/batch deadlock", async () => {
    const p = await product(10);
    const suppliers = ds.getRepository(Supplier);
    const supplier = await suppliers.save(
      suppliers.create({ companyName: unique() }),
    );
    supplierIds.push(supplier.id);
    const orders = ds.getRepository(PurchaseOrder);
    const po = await orders.save(
      orders.create({
        orderNumber: unique(),
        orderDate: new Date(),
        supplierId: supplier.id,
        status: PurchaseOrderStatus.READY,
        subtotal: 100,
        totalAmount: "100",
      }),
    );
    documentIds.push(po.id);
    const items = ds.getRepository(PurchaseOrderItem);
    await items.save(
      items.create({
        purchaseOrderId: po.id,
        productId: p.id,
        lineNumber: 1,
        quantity: 10,
        unitCost: 10,
      }),
    );
    // Real receive creates its movement, batch, and accounting entries. The
    // opening batch ensures fulfil still has 10 available after the return.
    await purchasing.receive(po.id);
    const a = await readyOrder([p], 2);
    const gate = barrier();
    const returning: Operation = {
      afterQuery: async (sql) => {
        if (sql.startsWith('DELETE FROM "purchase_cost_history"'))
          await gate.hold();
      },
    };
    const fulfill: Operation = {};
    const first = start(returning, () => purchasing.return(po.id));
    await gate.reached();
    const second = start(fulfill, () => sales.fulfillOrder(a.id));
    await blockedBy(fulfill, returning);
    gate.release();
    expect(await bounded(Promise.all([first, second]), "C completion")).toEqual(
      [{ status: "committed" }, { status: "committed" }],
    );
    expect((await orders.findOneByOrFail({ id: po.id })).status).toBe(
      PurchaseOrderStatus.READY,
    );
    expect(
      Number(
        (await items.findOneByOrFail({ purchaseOrderId: po.id }))
          .receivedQuantity,
      ),
    ).toBe(0);
    expect(
      await ds
        .getRepository(PurchaseCostHistory)
        .countBy({ purchaseOrderId: po.id }),
    ).toBe(0);
    await expectSalesState(a.id, SalesOrderStatus.FULFILLED);
    expect(await balances(p)).toEqual({ stock: 8, batches: 8 });
  }, 25000);

  it("D: opposite item orders cannot deadlock two multi-product fulfils", async () => {
    const productsById = new Map(
      [await product(), await product()].map((p) => [p.id, p]),
    );
    const products = [...productsById.keys()]
      .sort()
      .map((id) => productsById.get(id)!);
    const a = await readyOrder(products, 3);
    const b = await readyOrder([...products].reverse(), 5);
    // Relation load order is unspecified in production. Force the valid,
    // adversarial order [P,Q] / [Q,P] without changing the real lock queries.
    const findOne = EntityManager.prototype.findOne;
    jest
      .spyOn(EntityManager.prototype, "findOne")
      .mockImplementation(async function (this: EntityManager, ...args: any[]) {
        const row = await (findOne as any).apply(this, args);
        if (context.getStore() && args[0] === SalesOrder && row?.items) {
          row.items.sort(
            (x: SalesOrderItem, y: SalesOrderItem) =>
              x.lineNumber - y.lineNumber,
          );
        }
        return row;
      });
    const gate = barrier();
    let held = false;
    const firstOp: Operation = {
      afterQuery: async (sql) => {
        if (
          !held &&
          sql.includes('FROM "products"') &&
          sql.endsWith("FOR UPDATE")
        ) {
          held = true;
          await gate.hold();
        }
      },
    };
    const secondOp: Operation = {};
    const first = start(firstOp, () => sales.fulfillOrder(a.id));
    await gate.reached();
    const second = start(secondOp, () => sales.fulfillOrder(b.id));
    await blockedBy(secondOp, firstOp); // Base holds Q waiting P; fixed waits P before Q.
    gate.release();
    expect(await bounded(Promise.all([first, second]), "D completion")).toEqual(
      [{ status: "committed" }, { status: "committed" }],
    );
    for (const p of products)
      expect(await balances(p)).toEqual({ stock: 92, batches: 92 });
    for (const order of [a, b]) {
      expect(
        (await ds.getRepository(SalesOrder).findOneByOrFail({ id: order.id }))
          .status,
      ).toBe(SalesOrderStatus.FULFILLED);
    }
  }, 25000);

  // #1512 regression: receive with forced opposite item orders.
  async function readyPurchase(products: Product[], quantity: number) {
    const suppliers = ds.getRepository(Supplier);
    const supplier = await suppliers.save(
      suppliers.create({ companyName: unique() }),
    );
    supplierIds.push(supplier.id);
    const total = products.length * quantity * 10;
    const orders = ds.getRepository(PurchaseOrder);
    const po = await orders.save(
      orders.create({
        orderNumber: unique(),
        orderDate: new Date(),
        supplierId: supplier.id,
        status: PurchaseOrderStatus.READY,
        subtotal: total,
        totalAmount: String(total),
      }),
    );
    documentIds.push(po.id);
    const items = ds.getRepository(PurchaseOrderItem);
    for (const [index, p] of products.entries()) {
      await items.save(
        items.create({
          purchaseOrderId: po.id,
          productId: p.id,
          lineNumber: index + 1,
          quantity,
          unitCost: 10,
          totalAmount: quantity * 10,
        }),
      );
    }
    return po;
  }

  function forceLineOrder() {
    const findOne = EntityManager.prototype.findOne;
    jest
      .spyOn(EntityManager.prototype, "findOne")
      .mockImplementation(async function (this: EntityManager, ...args: any[]) {
        const row = await (findOne as any).apply(this, args);
        if (
          context.getStore() &&
          (args[0] === PurchaseOrder || args[0] === SalesOrder) &&
          row?.items
        ) {
          row.items.sort((x: any, y: any) => x.lineNumber - y.lineNumber);
        }
        return row;
      });
  }

  async function ascendingProducts() {
    const byId = new Map(
      [await product(), await product()].map((p) => [p.id, p]),
    );
    return [...byId.keys()].sort().map((id) => byId.get(id)!);
  }

  it("E: opposite item orders cannot deadlock two multi-product receives", async () => {
    const [p, q] = await ascendingProducts();
    const a = await readyPurchase([p, q], 4);
    const b = await readyPurchase([q, p], 6);
    forceLineOrder();
    const gate = barrier();
    let held = false;
    const firstOp: Operation = {
      afterQuery: async (sql) => {
        // After A's first batch insert: base holds P only; fixed holds P and Q.
        if (!held && sql.startsWith('INSERT INTO "purchase_cost_history"')) {
          held = true;
          await gate.hold();
        }
      },
    };
    const secondOp: Operation = {};
    const first = start(firstOp, () => purchasing.receive(a.id));
    await gate.reached();
    const second = start(secondOp, () => purchasing.receive(b.id));
    await blockedBy(secondOp, firstOp); // Base: B holds Q, waits P. Fixed: B waits P.
    gate.release();
    expect(await bounded(Promise.all([first, second]), "E completion")).toEqual(
      [{ status: "committed" }, { status: "committed" }],
    );
    for (const x of [p, q])
      expect(await balances(x)).toEqual({ stock: 110, batches: 110 });
  }, 25000);

  it("F: a reverse-order receive cannot deadlock an ascending fulfil", async () => {
    const [p, q] = await ascendingProducts();
    const po = await readyPurchase([q, p], 4);
    const so = await readyOrder([p, q], 3);
    forceLineOrder();
    const gate = barrier();
    let held = false;
    const receiving: Operation = {
      afterQuery: async (sql) => {
        // After the receive's first batch insert: base holds Q only.
        if (!held && sql.startsWith('INSERT INTO "purchase_cost_history"')) {
          held = true;
          await gate.hold();
        }
      },
    };
    const fulfill: Operation = {};
    const first = start(receiving, () => purchasing.receive(po.id));
    await gate.reached();
    const second = start(fulfill, () => sales.fulfillOrder(so.id));
    await blockedBy(fulfill, receiving); // Base: fulfil holds P, waits Q. Fixed: waits P.
    gate.release();
    expect(await bounded(Promise.all([first, second]), "F completion")).toEqual(
      [{ status: "committed" }, { status: "committed" }],
    );
    for (const x of [p, q])
      expect(await balances(x)).toEqual({ stock: 101, batches: 101 });
  }, 25000);
});
