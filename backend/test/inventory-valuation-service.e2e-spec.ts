import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { InventoryValuationService } from "../src/modules/inventory/valuation/inventory-valuation.service";
import {
  StockValuationEntry,
  StockValuationEntryKind,
} from "../src/database/entities/stock-valuation-entry.entity";
import { CostingMethod } from "../src/common/costing/supported-costing-methods";
import {
  activateValuationForTest,
  deactivateValuationForTest,
} from "./utils/valuation-fixture";

let app: INestApplication;
let ds: DataSource;
let service: InventoryValuationService;
let categoryId: string;
let productId: string;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  ds = app.get(DataSource);
  service = app.get(InventoryValuationService);
});

beforeEach(async () => {
  categoryId = randomUUID();
  productId = randomUUID();
  await ds.query(
    `INSERT INTO categories (id, name, slug) VALUES ($1, $2, $3)`,
    [categoryId, `valuation-${categoryId}`, `valuation-${categoryId}`],
  );
  await ds.query(
    `INSERT INTO products (id, name, slug, type, "baseCost", "stockQuantity", "categoryId") VALUES ($1, $2, $3, 'Stocked Product', 1, 10, $4)`,
    [productId, `valuation-${productId}`, `valuation-${productId}`, categoryId],
  );
});

afterEach(async () => {
  await deactivateValuationForTest(ds);
  await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
  await ds.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
});

afterAll(async () => app.close());

async function seed(method: CostingMethod): Promise<StockValuationEntry> {
  await activateValuationForTest(ds, {
    method,
    products: [{ productId, quantity: "10", value: "1000.00" }],
  });
  return ds.manager.findOneOrFail(StockValuationEntry, {
    where: { productId, kind: StockValuationEntryKind.CUTOVER_OPENING },
  });
}

describe.each(["AVERAGE", "FIFO"] as CostingMethod[])(
  "InventoryValuationService (%s)",
  (method) => {
    it("values a partial decrease and restores the decrease exactly", async () => {
      const original = await seed(method);
      const decrease = await service.valueDecrease(
        ds.manager,
        productId,
        40000n,
        StockValuationEntryKind.ISSUE,
      );
      expect(decrease.valueCents).toBe(-40000n);
      expect(decrease.runningQuantityMinor).toBe(60000n);
      expect(decrease.runningValueCents).toBe(60000n);
      const reversal = await service.valueDecreaseReversal(ds.manager, {
        ...original,
        id: randomUUID(),
        kind: StockValuationEntryKind.ISSUE,
        quantity: "-4.0000",
        value: "-400.00",
      });
      expect(reversal.valueCents).toBe(40000n);
      expect(reversal.runningQuantityMinor).toBe(100000n);
      expect(reversal.runningValueCents).toBe(100000n);
      if (method === "FIFO")
        expect(reversal.openLayer).toEqual({
          qty: 40000n,
          unitValueScale4: 1000000n,
          value: 40000n,
        });
      const [balance] = await ds.query(
        `SELECT "quantityOnHand", "valueOnHand" FROM product_valuation_balances WHERE "productId" = $1`,
        [productId],
      );
      expect(balance.quantityOnHand).toBe("10.0000");
      expect(balance.valueOnHand).toBe("1000.00");
    });

    it("rejects an increase reversal after a later method change and permits decrease reversal", async () => {
      const original = await seed(method);
      await ds.query(
        `INSERT INTO stock_valuation_entries ("productId", kind, method, quantity, value, "runningQuantity", "runningValue", "createdAt") VALUES ($1, 'method_change', $2, 0, 0, 10, 1000, now() + interval '1 second')`,
        [productId, method],
      );
      await expect(
        service.assertIncreaseReversible(ds.manager, original),
      ).rejects.toThrow(
        "This receipt was valued before the costing method changed",
      );
      const decrease = await service.valueDecrease(
        ds.manager,
        productId,
        10000n,
        StockValuationEntryKind.ISSUE,
      );
      expect(decrease.valueCents).toBe(-10000n);
      const reversal = await service.valueDecreaseReversal(ds.manager, {
        ...original,
        id: randomUUID(),
        kind: StockValuationEntryKind.ISSUE,
        quantity: "-1.0000",
        value: "-100.00",
      });
      expect(reversal.valueCents).toBe(10000n);
      expect(reversal.runningQuantityMinor).toBe(100000n);
    });

    it("refuses an increase reversal after its FIFO layer has been consumed", async () => {
      if (method !== "FIFO") return;
      const original = await seed(method);
      await service.valueDecrease(
        ds.manager,
        productId,
        10000n,
        StockValuationEntryKind.ISSUE,
      );
      await expect(
        service.assertIncreaseReversible(ds.manager, original),
      ).rejects.toThrow("has been consumed");
    });
  },
);
