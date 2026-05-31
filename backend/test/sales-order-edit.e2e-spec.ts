import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Customer, CustomerType } from '../src/database/entities/customer.entity';
import {
  SalesOrder,
  SalesOrderPaymentStatus,
  SalesOrderStatus,
} from '../src/database/entities/sales-order.entity';
import {
  DiscountType,
  SalesOrderItem,
} from '../src/database/entities/sales-order-item.entity';
import { SalesOrderService } from '../src/modules/sales/services/sales-order.service';
import { seedCategory, seedProduct, truncateAll } from './e2e/helpers/seed';

describe('Sales order edit transaction (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let salesOrderService: SalesOrderService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    salesOrderService = app.get(SalesOrderService);
    await truncateAll(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  it('rolls back deleted items and totals when replacement item insertion fails', async () => {
    const category = await seedCategory(dataSource);
    const product = await seedProduct(dataSource, category.id, {
      baseCost: 100,
      stockQuantity: 100,
    });
    const customerRepo = dataSource.getRepository(Customer);
    const customer = await customerRepo.save(customerRepo.create({
      type: CustomerType.BUSINESS,
      name: 'Rollback Test Customer',
      isActive: true,
    }));
    const orderRepo = dataSource.getRepository(SalesOrder);
    const order = await orderRepo.save(orderRepo.create({
      orderNumber: 'SO-ROLLBACK-001',
      orderDate: new Date(),
      customerId: customer.id,
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.UNPAID,
      subtotal: 100,
      shippingAmount: 0,
      totalAmount: 100,
      paidAmount: 0,
      balanceDue: 100,
    }));
    const itemRepo = dataSource.getRepository(SalesOrderItem);
    const originalItem = await itemRepo.save(itemRepo.create({
      lineNumber: 1,
      salesOrderId: order.id,
      productId: product.id,
      quantity: 1,
      unitPrice: 100,
      unitCost: 100,
      discountType: DiscountType.PERCENTAGE,
      discountPercent: 0,
      discountAmount: 0,
      totalAmount: 100,
    }));

    await expect(salesOrderService.update(order.id, {
      items: [{
        productId: product.id,
        quantity: 2147483648,
        unitPrice: 50,
      }],
    })).rejects.toThrow();

    const persistedOrder = await orderRepo.findOneOrFail({ where: { id: order.id } });
    const persistedItems = await itemRepo.find({ where: { salesOrderId: order.id } });

    expect(Number(persistedOrder.subtotal)).toBe(100);
    expect(Number(persistedOrder.totalAmount)).toBe(100);
    expect(persistedItems).toHaveLength(1);
    expect(persistedItems[0].id).toBe(originalItem.id);
    expect(persistedItems[0].quantity).toBe(1);
    expect(Number(persistedItems[0].totalAmount)).toBe(100);
  });
});
