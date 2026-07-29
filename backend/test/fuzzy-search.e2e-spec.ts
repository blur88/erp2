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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
      await dataSource.destroy();
    }
    await app.close();
  });

  async function seed(): Promise<void> {
    await dataSource.query(
      "TRUNCATE TABLE vendor_payments, purchase_order_items, purchase_orders, payments, sales_order_items, sales_orders, products, categories, customers, suppliers RESTART IDENTITY CASCADE",
    );

    const [category] = await dataSource.query(
      `INSERT INTO categories ("name", "slug", "level")
       VALUES ('Trgm Category', 'trgm-category', 0) RETURNING id`,
    );
    categoryId = category.id;

    await dataSource.query(
      `INSERT INTO products ("name", "slug", "barcode", "baseCost", "categoryId")
       VALUES ('Hydraulic Compressor', 'hydraulic-compressor', '9911223344', 10, $1)`,
      [categoryId],
    );

    const [customer] = await dataSource.query(
      `INSERT INTO customers ("name", "slug", "phone", "type")
       VALUES ('Ferdinand Wholesale', 'ferdinand-wholesale', '0175558888', 'individual')
       RETURNING id`,
    );
    customerId = customer.id;

    const [supplier] = await dataSource.query(
      `INSERT INTO suppliers ("companyName", "slug", "type")
       VALUES ('Bergstrom Industries', 'bergstrom-industries', 'local')
       RETURNING id`,
    );
    supplierId = supplier.id;

    await dataSource.query(
      `INSERT INTO sales_orders
         ("orderNumber", "orderDate", "customerId", "subtotal", "totalAmount", "balanceDue")
       VALUES ('SO-2026-004417', NOW(), $1, 0, 0, 0)`,
      [customerId],
    );

    await dataSource.query(
      `INSERT INTO purchase_orders
         ("orderNumber", "orderDate", "supplierId", "subtotal", "totalAmount")
       VALUES ('PO-2026-008852', NOW(), $1, 0, 0)`,
      [supplierId],
    );
  }

  // Each query is misspelled so the primary ILIKE '%q%' path returns zero rows
  // and execution reaches the fuzzy branch.

  it("1. matches products.name on a misspelling", async () => {
    const results = await productService.searchGlobal("Hydraulik Compresor", admin);
    expect(results.length).toBeGreaterThan(0);
  });

  it("2. matches products.barcode on a transposed digit", async () => {
    const results = await productService.searchGlobal("9911223434", admin);
    expect(results.length).toBeGreaterThan(0);
  });

  it("3. matches customers.name on a misspelling", async () => {
    const results = await customerService.searchGlobal("Ferdinnand Wholesle", admin);
    expect(results.length).toBeGreaterThan(0);
  });

  it("4. matches customers.phone on a transposed digit", async () => {
    const results = await customerService.searchGlobal("0175585888", admin);
    expect(results.length).toBeGreaterThan(0);
  });

  it("5. matches suppliers.companyName on a misspelling", async () => {
    const results = await supplierService.searchGlobal("Bergstrum Industrys", admin);
    expect(results.length).toBeGreaterThan(0);
  });

  it("6. matches sales_orders.orderNumber on a misspelling", async () => {
    const results = await salesOrderService.searchGlobal("SO-2026-004471", admin);
    expect(results.length).toBeGreaterThan(0);
  });

  it("7. matches purchase_orders.orderNumber on a misspelling", async () => {
    const results = await purchaseOrderService.searchGlobal("PO-2026-008582", admin);
    expect(results.length).toBeGreaterThan(0);
  });
});
