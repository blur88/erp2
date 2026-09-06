import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { UserRole } from "../src/database/entities/user.entity";
import { ProductService } from "../src/modules/inventory/services/product.service";
import { CustomerService } from "../src/modules/sales/services/customer.service";
import { SupplierService } from "../src/modules/purchasing/services/supplier.service";
import { SalesOrderService } from "../src/modules/sales/services/sales-order.service";
import { PurchaseOrderService } from "../src/modules/purchasing/services/purchase-order.service";
import { configureTestAppValidation } from "./utils/configure-test-app-validation";
import {
  FUZZY_PRODUCT_NAME,
  FUZZY_CUSTOMER_NAME,
  FUZZY_SUPPLIER_NAME,
  FUZZY_CATEGORY_NAME,
  FUZZY_SALES_ORDER_NUMBER,
  FUZZY_PURCHASE_ORDER_NUMBER,
  resetFuzzySearchFixtures,
} from "./utils/fuzzy-search-fixture";

describe("fuzzy search fallback (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let productService: ProductService;
  let customerService: CustomerService;
  let supplierService: SupplierService;
  let salesOrderService: SalesOrderService;
  let purchaseOrderService: PurchaseOrderService;

  const admin = { role: UserRole.ADMIN } as any;

  let categoryId: string;
  let customerId: string;
  let supplierId: string;
  let productId: string;
  let salesOrderId: string;
  let purchaseOrderId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    productService = moduleFixture.get(ProductService);
    customerService = moduleFixture.get(CustomerService);
    supplierService = moduleFixture.get(SupplierService);
    salesOrderService = moduleFixture.get(SalesOrderService);
    purchaseOrderService = moduleFixture.get(PurchaseOrderService);

    await seed();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await resetFuzzySearchFixtures(dataSource);
      await dataSource.destroy();
    }
    await app.close();
  });

  async function seed(): Promise<void> {
    // Own-rows reset only. This suite no longer truncates the shared e2e
    // database (issue #1199); running it first also clears anything a
    // previous interrupted run left behind.
    await resetFuzzySearchFixtures(dataSource);

    const [category] = await dataSource.query(
      `INSERT INTO categories ("name", "slug", "level")
       VALUES ($1, 'qwentrix-category', 0) RETURNING id`,
      [FUZZY_CATEGORY_NAME],
    );
    categoryId = category.id;

    const [product] = await dataSource.query(
      `INSERT INTO products ("name", "slug", "barcode", "baseCost", "categoryId")
       VALUES ($1, 'qwentrix-hydraulic-compressor', '9911223344', 10, $2)
       RETURNING id`,
      [FUZZY_PRODUCT_NAME, categoryId],
    );
    productId = product.id;

    const [customer] = await dataSource.query(
      `INSERT INTO customers ("name", "slug", "phone", "type")
       VALUES ($1, 'qwentrix-ferdinand-wholesale', '0175558888', 'individual')
       RETURNING id`,
      [FUZZY_CUSTOMER_NAME],
    );
    customerId = customer.id;

    const [supplier] = await dataSource.query(
      `INSERT INTO suppliers ("companyName", "slug", "type")
       VALUES ($1, 'qwentrix-bergstrom-industries', 'local')
       RETURNING id`,
      [FUZZY_SUPPLIER_NAME],
    );
    supplierId = supplier.id;

    const [salesOrder] = await dataSource.query(
      `INSERT INTO sales_orders
         ("orderNumber", "orderDate", "customerId", "subtotal", "totalAmount", "balanceDue")
       VALUES ($1, NOW(), $2, 0, 0, 0) RETURNING id`,
      [FUZZY_SALES_ORDER_NUMBER, customerId],
    );
    salesOrderId = salesOrder.id;

    const [purchaseOrder] = await dataSource.query(
      `INSERT INTO purchase_orders
         ("orderNumber", "orderDate", "supplierId", "subtotal", "totalAmount")
       VALUES ($1, NOW(), $2, 0, 0) RETURNING id`,
      [FUZZY_PURCHASE_ORDER_NUMBER, supplierId],
    );
    purchaseOrderId = purchaseOrder.id;
  }

  // Each query is misspelled so the primary ILIKE '%q%' path returns zero rows
  // and execution reaches the fuzzy branch.
  //
  // Each assertion pins the SEEDED row by id rather than checking length > 0.
  // searchGlobal returns early as soon as the ILIKE path matches ANY row, so on
  // a shared database a length-only assertion could be satisfied by an
  // unrelated leftover via the ILIKE path while the fuzzy branch never ran —
  // the exact thing these tests exist to exercise. The old global TRUNCATE hid
  // this by guaranteeing an empty table (issue #1199).

  it("1. matches products.name on a misspelling", async () => {
    const results = await productService.searchGlobal(
      "Qwentrux Hydraulik Compresor",
      admin,
    );
    expect(results.some((r) => r.id === productId)).toBe(true);
  });

  it("2. matches products.barcode on a transposed digit", async () => {
    const results = await productService.searchGlobal("9911223434", admin);
    expect(results.some((r) => r.id === productId)).toBe(true);
  });

  it("3. matches customers.name on a misspelling", async () => {
    const results = await customerService.searchGlobal(
      "Qwentrux Ferdinnand Wholesle",
      admin,
    );
    expect(results.some((r) => r.id === customerId)).toBe(true);
  });

  it("4. matches customers.phone on a transposed digit", async () => {
    const results = await customerService.searchGlobal("0175585888", admin);
    expect(results.some((r) => r.id === customerId)).toBe(true);
  });

  it("5. matches suppliers.companyName on a misspelling", async () => {
    const results = await supplierService.searchGlobal(
      "Qwentrux Bergstrum Industrys",
      admin,
    );
    expect(results.some((r) => r.id === supplierId)).toBe(true);
  });

  it("6. matches sales_orders.orderNumber on a misspelling", async () => {
    const results = await salesOrderService.searchGlobal(
      "SO-2091-004471",
      admin,
    );
    expect(results.some((r) => r.id === salesOrderId)).toBe(true);
  });

  it("7. matches purchase_orders.orderNumber on a misspelling", async () => {
    const results = await purchaseOrderService.searchGlobal(
      "PO-2091-008582",
      admin,
    );
    expect(results.some((r) => r.id === purchaseOrderId)).toBe(true);
  });
});
