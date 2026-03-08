import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Product } from '../../../database/entities/product.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
import { SalesAnalyticsReportService } from './sales-analytics-report.service';

describe('SalesAnalyticsReportService', () => {
  let service: SalesAnalyticsReportService;
  let productRepository: jest.Mocked<Repository<Product>>;
  let salesOrderItemRepository: jest.Mocked<Repository<SalesOrderItem>>;
  let purchaseOrderItemRepository: jest.Mocked<Repository<PurchaseOrderItem>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesAnalyticsReportService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: {
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrderItem),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PurchaseOrderItem),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SalesAnalyticsReportService);
    productRepository = module.get(getRepositoryToken(Product));
    salesOrderItemRepository = module.get(getRepositoryToken(SalesOrderItem));
    purchaseOrderItemRepository = module.get(getRepositoryToken(PurchaseOrderItem));
  });

  it('builds product summary metrics from sales and purchase items', async () => {
    productRepository.find.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Widget',
        category: { name: 'Hardware' },
      },
    ] as Product[]);

    const salesQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { quantity: 2, unitPrice: 50, unitCost: 20 },
        { quantity: 1, unitPrice: 75, unitCost: 20 },
      ]),
    };

    const purchaseQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { quantity: 5, unitCost: 18 },
      ]),
    };

    salesOrderItemRepository.createQueryBuilder.mockReturnValue(salesQueryBuilder as any);
    purchaseOrderItemRepository.createQueryBuilder.mockReturnValue(purchaseQueryBuilder as any);

    const result = await service.getProductSummary({});

    expect(result).toEqual({
      data: [
        {
          productId: 'product-1',
          productName: 'Widget',
          category: 'Hardware',
          soldQty: 3,
          totalSales: 175,
          cost: 60,
          salesProfit: 115,
          purchaseQty: 5,
          purchaseSubtotal: 90,
          totalProfit: 85,
        },
      ],
    });
  });
});
