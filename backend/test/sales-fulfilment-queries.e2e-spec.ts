import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import {
  Customer,
  CustomerType,
} from "../src/database/entities/customer.entity";
import {
  SalesOrder,
  SalesOrderPaymentStatus,
  SalesOrderStatus,
} from "../src/database/entities/sales-order.entity";
import { CustomerService } from "../src/modules/sales/services/customer.service";
import { SalesAnalyticsService } from "../src/modules/sales/services/sales-analytics.service";
import { resetSuiteBusinessRows } from "./utils/shared-e2e-business-fixture";
import { configureTestAppValidation } from "./utils/configure-test-app-validation";

// Issue #1355. `SalesOrder.isFulfilled` is a getter computed from `status`;
// `sales_orders` has no such column. A query that names it reaches Postgres as
// the bare word `order.isFulfilled` and is rejected ("syntax error at or near
// "order""). The unit specs mock the query builder, so only a suite that
// executes these queries against Postgres can see it.
//
// Every assertion is scoped to the one customer this suite owns: the database
// is shared with the other suites, so unscoped counts are not this suite's.
describe("Fulfilment in sales queries (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let analytics: SalesAnalyticsService;
  let customers: CustomerService;
  let customerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = app.get(DataSource);
    analytics = app.get(SalesAnalyticsService);
    customers = app.get(CustomerService);

    const customerRepo = dataSource.getRepository(Customer);
    const customer = await customerRepo.save(
      customerRepo.create({
        type: CustomerType.BUSINESS,
        name: `Fulfilment Query Customer ${Date.now()}`,
        isActive: true,
      }),
    );
    customerId = customer.id;

    // One fulfilled order of 300 and one draft order of 100, both dated now.
    const orderRepo = dataSource.getRepository(SalesOrder);
    const stamp = Date.now();
    const order = (
      suffix: string,
      status: SalesOrderStatus,
      total: string,
    ) =>
      orderRepo.create({
        orderNumber: `SO-FQ-${stamp}-${suffix}`,
        orderDate: new Date(),
        customerId,
        status,
        paymentStatus: SalesOrderPaymentStatus.UNPAID,
        subtotal: Number(total),
        shippingAmount: 0,
        totalAmount: total,
        paidAmount: "0.0000",
        balanceDue: total,
      });
    await orderRepo.save([
      order("F", SalesOrderStatus.FULFILLED, "300.0000"),
      order("D", SalesOrderStatus.DRAFT, "100.0000"),
    ]);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await resetSuiteBusinessRows(dataSource, { customerIds: [customerId] });
      await dataSource.destroy();
    }
    await app.close();
  });

  it("the dashboard metrics count fulfilled and unfulfilled orders", async () => {
    const result = await analytics.getSalesAnalytics({ customerId } as never);
    const metrics = result.current.metrics as unknown as Record<string, number>;

    expect(metrics.totalOrders).toBe(2);
    expect(metrics.totalRevenue).toBe(400);
    // 1 of 2 orders is fulfilled.
    expect(metrics.conversionRate).toBe(50);
  });

  it("the fulfilment filter keeps only fulfilled orders", async () => {
    const result = await analytics.getSalesAnalytics({
      customerId,
      fulfillmentStatus: "fulfilled",
    } as never);
    const metrics = result.current.metrics as unknown as Record<string, number>;

    expect(metrics.totalOrders).toBe(1);
    expect(metrics.totalRevenue).toBe(300);
  });

  it("the fulfilment filter keeps only unfulfilled orders", async () => {
    const result = await analytics.getSalesAnalytics({
      customerId,
      fulfillmentStatus: "unfulfilled",
    } as never);
    const metrics = result.current.metrics as unknown as Record<string, number>;

    expect(metrics.totalOrders).toBe(1);
    expect(metrics.totalRevenue).toBe(100);
  });

  it("the pipeline groups orders into fulfilled and pending", async () => {
    const pipeline = await analytics.getSalesPipeline({ customerId } as never);
    const stage = (status: string) =>
      pipeline.stages.find((s) => s.status === status);

    expect(pipeline.totalOrders).toBe(2);
    expect(stage("fulfilled")?.orderCount).toBe(1);
    expect(stage("fulfilled")?.totalValue).toBe(300);
    expect(stage("pending")?.orderCount).toBe(1);
    expect(stage("pending")?.totalValue).toBe(100);
    expect(pipeline.conversionRate).toBe(50);
  });

  it("customer statistics count only fulfilled orders", async () => {
    const stats = await customers.getCustomerStatistics(customerId);

    expect(stats.orders.totalOrders).toBe(1);
    expect(stats.orders.totalSales).toBe(300);
  });

  it("the customer metric update stores the fulfilled totals", async () => {
    await customers.updateCustomerMetrics(customerId);

    const stored = await dataSource
      .getRepository(Customer)
      .findOneByOrFail({ id: customerId });
    expect(stored.totalOrders).toBe(1);
    expect(Number(stored.totalSales)).toBe(300);
  });
});
