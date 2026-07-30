import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { configureTestAppValidation } from "./utils/configure-test-app-validation";

import { AppModule } from "../src/app.module";
import { Category } from "../src/database/entities/category.entity";
import {
  Customer,
  CustomerType,
} from "../src/database/entities/customer.entity";
import { PaymentMethodEntity } from "../src/database/entities/payment-method.entity";
import { Product } from "../src/database/entities/product.entity";
import {
  SalesOrder,
  SalesOrderPaymentStatus,
  SalesOrderStatus,
} from "../src/database/entities/sales-order.entity";
import {
  DiscountType,
  SalesOrderItem,
} from "../src/database/entities/sales-order-item.entity";
import { SalesOrderFulfillmentService } from "../src/modules/sales/services/sales-order-fulfillment.service";
import { SalesOrderLifecycleService } from "../src/modules/sales/services/sales-order-lifecycle.service";
import { SalesOrderPaymentService } from "../src/modules/sales/services/sales-order-payment.service";
import {
  seedCategory,
  seedDocumentNumberSettings,
  seedPaymentMethod,
  seedProduct,
  truncateAll,
} from "./e2e/helpers/seed";

describe("Sales order transition concurrency (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let fulfillment: SalesOrderFulfillmentService;
  let lifecycle: SalesOrderLifecycleService;
  let payment: SalesOrderPaymentService;

  let category: Category;
  let product: Product;
  let paymentMethod: PaymentMethodEntity;
  let customer: Customer;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = app.get(DataSource);
    fulfillment = app.get(SalesOrderFulfillmentService);
    lifecycle = app.get(SalesOrderLifecycleService);
    payment = app.get(SalesOrderPaymentService);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }

    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
    category = await seedCategory(dataSource);
    product = await seedProduct(dataSource, category.id, {
      baseCost: 100,
      stockQuantity: 1000,
    });
    paymentMethod = await seedPaymentMethod(dataSource);
    await seedDocumentNumberSettings(dataSource);

    const customerRepo = dataSource.getRepository(Customer);
    customer = await customerRepo.save(
      customerRepo.create({
        type: CustomerType.BUSINESS,
        name: "Concurrency Customer",
        isActive: true,
      }),
    );
  });

  async function seedDraftOrder(
    orderNumber: string,
    qty = 1,
  ): Promise<SalesOrder> {
    const total = qty * 100;
    const orderRepo = dataSource.getRepository(SalesOrder);
    const order = await orderRepo.save(
      orderRepo.create({
        orderNumber,
        orderDate: new Date(),
        customerId: customer.id,
        status: SalesOrderStatus.DRAFT,
        paymentStatus: SalesOrderPaymentStatus.UNPAID,
        subtotal: total,
        shippingAmount: 0,
        totalAmount: total,
        paidAmount: 0,
        balanceDue: total,
      }),
    );

    const itemRepo = dataSource.getRepository(SalesOrderItem);
    await itemRepo.save(
      itemRepo.create({
        lineNumber: 1,
        salesOrderId: order.id,
        productId: product.id,
        quantity: qty,
        unitPrice: 100,
        unitCost: 100,
        discountType: DiscountType.PERCENTAGE,
        discountPercent: 0,
        discountAmount: 0,
        totalAmount: total,
      }),
    );

    return order;
  }

  async function seedReadyOrder(
    orderNumber: string,
    qty = 1,
  ): Promise<SalesOrder> {
    const order = await seedDraftOrder(orderNumber, qty);
    await payment.recordPayment(order.id, {
      paymentMethodId: paymentMethod.id,
      amount: qty * 100,
      paymentDate: new Date(),
    } as any);

    return dataSource
      .getRepository(SalesOrder)
      .findOneOrFail({ where: { id: order.id } });
  }

  function partition(results: PromiseSettledResult<unknown>[]) {
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<unknown> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    return { fulfilled, rejected };
  }

  it("fulfill vs fulfill: exactly one wins, stock reduced once", async () => {
    const order = await seedReadyOrder("SO-CC-FF-001", 1);

    const results = await Promise.allSettled([
      fulfillment.fulfillOrder(order.id),
      fulfillment.fulfillOrder(order.id),
    ]);
    const { fulfilled, rejected } = partition(results);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as Error).message).toMatch(/already fulfilled/i);

    const persisted = await dataSource.getRepository(SalesOrder).findOneOrFail({
      where: { id: order.id },
    });
    expect(persisted.status).toBe(SalesOrderStatus.FULFILLED);

    const persistedProduct = await dataSource
      .getRepository(Product)
      .findOneOrFail({
        where: { id: product.id },
      });
    expect(Number(persistedProduct.stockQuantity)).toBe(999);
  });

  it("cancel vs recordPayment: never CANCELLED with paidAmount > 0", async () => {
    const order = await seedDraftOrder("SO-CC-CP-001", 1);

    const results = await Promise.allSettled([
      lifecycle.cancel(order.id),
      payment.recordPayment(order.id, {
        paymentMethodId: paymentMethod.id,
        amount: 100,
        paymentDate: new Date(),
      } as any),
    ]);
    const { fulfilled } = partition(results);

    expect(fulfilled).toHaveLength(1);

    const persisted = await dataSource.getRepository(SalesOrder).findOneOrFail({
      where: { id: order.id },
    });

    if (persisted.status === SalesOrderStatus.CANCELLED) {
      expect(Number(persisted.paidAmount)).toBe(0);
      expect(persisted.paymentStatus).toBe(SalesOrderPaymentStatus.UNPAID);
    } else {
      expect(persisted.status).toBe(SalesOrderStatus.READY);
      expect(Number(persisted.paidAmount)).toBe(100);
      expect(persisted.paymentStatus).toBe(SalesOrderPaymentStatus.PAID);
    }

    expect(
      persisted.status === SalesOrderStatus.CANCELLED &&
        Number(persisted.paidAmount) > 0,
    ).toBe(false);
  });

  it("fulfill vs cancel: exactly one terminal state, never both", async () => {
    const order = await seedReadyOrder("SO-CC-FC-001", 1);

    const results = await Promise.allSettled([
      fulfillment.fulfillOrder(order.id),
      lifecycle.cancel(order.id),
    ]);
    const { fulfilled, rejected } = partition(results);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const persisted = await dataSource.getRepository(SalesOrder).findOneOrFail({
      where: { id: order.id },
    });

    expect([SalesOrderStatus.FULFILLED, SalesOrderStatus.CANCELLED]).toContain(
      persisted.status,
    );

    const persistedProduct = await dataSource
      .getRepository(Product)
      .findOneOrFail({
        where: { id: product.id },
      });
    if (persisted.status === SalesOrderStatus.FULFILLED) {
      expect(Number(persistedProduct.stockQuantity)).toBe(999);
    } else {
      expect(Number(persistedProduct.stockQuantity)).toBe(1000);
    }
  });

  it("concurrent partial payments: both apply, paidAmount is the sum (no lost update)", async () => {
    const order = await seedDraftOrder("SO-CC-PP-001", 2);

    const results = await Promise.allSettled([
      payment.recordPayment(order.id, {
        paymentMethodId: paymentMethod.id,
        amount: 100,
        paymentDate: new Date(),
      } as any),
      payment.recordPayment(order.id, {
        paymentMethodId: paymentMethod.id,
        amount: 100,
        paymentDate: new Date(),
      } as any),
    ]);
    const { fulfilled } = partition(results);

    expect(fulfilled).toHaveLength(2);

    const persisted = await dataSource.getRepository(SalesOrder).findOneOrFail({
      where: { id: order.id },
    });

    expect(Number(persisted.paidAmount)).toBe(200);
    expect(Number(persisted.balanceDue)).toBe(0);
    expect(persisted.paymentStatus).toBe(SalesOrderPaymentStatus.PAID);
    expect(persisted.status).toBe(SalesOrderStatus.READY);
  });
});
