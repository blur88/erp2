import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { ProductService } from './product.service';
import { Product, ProductType } from '../../../database/entities/product.entity';
import { Category } from '../../../database/entities/category.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
import { StockMovement, StockMovementType } from '../../../database/entities/stock-movement.entity';
import { StockAdjustmentItem } from '../../../database/entities/stock-adjustment.entity';

import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { CategoryService } from './category.service';
import { StockMovementService } from './stock-movement.service';
import { BaseCostCalculatorService } from './base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { UserRole } from '../../../database/entities/user.entity';

describe('ProductService pagination removal', () => {
  let service: ProductService;
  let productRepository: jest.Mocked<Repository<Product>>;
  const adminUser = { role: UserRole.ADMIN } as any;

  const createProduct = (id: string, overrides: Partial<Product> = {}): Product =>
    ({
      id,
      name: `Product ${id}`,
      description: null,
      barcode: `SKU-${id}`,
      type: ProductType.GOODS,
      isActive: true,
      baseCost: 12.5,
      stockQuantity: 4,
      notes: null,
      categoryId: 'category-1',
      category: {
        id: 'category-1',
        name: 'Category',
        fullPath: 'Inventory > Category',
      } as Category,
      priceListItems: [],
      isOutOfStock: false,
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-10T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    }) as Product;

  const createQueryBuilder = (products: Product[]) => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([products, products.length]),
    };

    return qb;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn(),
          },
        },
        { provide: getRepositoryToken(Category), useValue: {} },
        { provide: getRepositoryToken(SalesOrderItem), useValue: {} },
        { provide: getRepositoryToken(PurchaseOrderItem), useValue: {} },
        { provide: getRepositoryToken(StockMovement), useValue: {} },
        { provide: getRepositoryToken(StockAdjustmentItem), useValue: {} },
        { provide: getRepositoryToken(PurchaseCostHistory), useValue: {} },
        { provide: CategoryService, useValue: {} },
        { provide: StockMovementService, useValue: {} },
        { provide: BaseCostCalculatorService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProductService);
    productRepository = module.get(getRepositoryToken(Product));
  });

  describe('CSV import parser hardening', () => {
    const requiredHeader = 'name,type,categoryName,baseCost';
    const validDataRow = 'Widget,GOODS,Hardware,12.50';

    it('parseCsvContent rejects non-string content', () => {
      expect(() => (service as any).parseCsvContent({ length: 2 })).toThrow(BadRequestException);
      expect(() => (service as any).parseCsvContent({ length: 2 })).toThrow(
        'CSV content must be a string',
      );
    });

    it('parseCsvContent accepts exactly 1000 data rows plus a header row', () => {
      const content = `${requiredHeader}\n${Array.from({ length: 1000 }, () => validDataRow).join('\n')}`;

      const rows = (service as any).parseCsvContent(content);

      expect(rows).toHaveLength(1000);
      expect(rows[0]).toEqual({
        name: 'Widget',
        type: 'GOODS',
        categoryname: 'Hardware',
        basecost: '12.50',
      });
    });

    it('parseCsvContent rejects 1001 data rows plus a header row', () => {
      const content = `${requiredHeader}\n${Array.from({ length: 1001 }, () => validDataRow).join('\n')}`;

      expect(() => (service as any).parseCsvContent(content)).toThrow(BadRequestException);
      expect(() => (service as any).parseCsvContent(content)).toThrow(
        'Import file exceeds maximum allowed data rows (1000)',
      );
    });

    it('parseCsvLine rejects non-string input', () => {
      expect(() => (service as any).parseCsvLine({ length: 8192 })).toThrow(BadRequestException);
      expect(() => (service as any).parseCsvLine({ length: 8192 })).toThrow(
        'CSV line must be a string',
      );
    });

    it('parseCsvLine accepts a line exactly 8192 characters long', () => {
      const line = 'a'.repeat(8192);

      expect((service as any).parseCsvLine(line)).toEqual([line]);
    });

    it('parseCsvLine rejects a line longer than 8192 characters', () => {
      const line = 'a'.repeat(8193);

      expect(() => (service as any).parseCsvLine(line)).toThrow(BadRequestException);
      expect(() => (service as any).parseCsvLine(line)).toThrow(
        'CSV line exceeds maximum allowed length (8192 characters)',
      );
    });

    it('parseCsvLine preserves quoted comma parsing for valid CSV lines', () => {
      expect((service as any).parseCsvLine('Widget,"Hardware, Tools",12.50')).toEqual([
        'Widget',
        'Hardware, Tools',
        '12.50',
      ]);
    });
  });

  it('findAll returns all matching products with total-only metadata', async () => {
    const products = [createProduct('1'), createProduct('2')];
    const qb = createQueryBuilder(products);
    productRepository.createQueryBuilder.mockReturnValue(qb as any);

    const result = await service.findAll({ search: 'Product' });

    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.take).not.toHaveBeenCalled();
    expect(result.meta).toEqual({ total: 2 });
    expect(result.data).toHaveLength(2);
  });

  it('findDeleted returns all deleted products with total-only metadata', async () => {
    const products = [
      createProduct('deleted-1', {
        deletedAt: new Date('2026-03-10T00:00:00.000Z'),
      }),
    ];
    const qb = createQueryBuilder(products);
    productRepository.createQueryBuilder.mockReturnValue(qb as any);

    const result = await service.findDeleted({});

    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.take).not.toHaveBeenCalled();
    expect(result.meta).toEqual({ total: 1 });
    expect(result.data).toHaveLength(1);
  });

  it('findDeleted uses the same pricing joins as active product queries', async () => {
    const qb = createQueryBuilder([
      createProduct('deleted-2', {
        deletedAt: new Date('2026-03-11T00:00:00.000Z'),
      }),
    ]);
    productRepository.createQueryBuilder.mockReturnValue(qb as any);

    await service.findDeleted({});

    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
      'product.priceListItems',
      'priceListItems',
      'priceListItems.isActive = :isActiveItem',
      { isActiveItem: true },
    );
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
      'priceListItems.priceList',
      'priceList',
      'priceList.isActive = :isActiveList AND priceList.deletedAt IS NULL',
      { isActiveList: true },
    );
  });

  describe('searchGlobal', () => {
    it('returns matching products as GlobalSearchResultDto', async () => {
      const product = {
        id: 'prod-uuid-1',
        name: 'Widget A',
        barcode: 'SKU-001',
        deletedAt: null,
      };
      productRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([product]),
      } as any);

      const results = await service.searchGlobal('Widget', {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'product',
        id: 'prod-uuid-1',
        label: 'Widget A',
        description: 'SKU-001',
        route: '/inventory/products/prod-uuid-1/edit',
      });
    });

    it('returns empty array when no matches', async () => {
      productRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      const results = await service.searchGlobal('zzz', {
        role: UserRole.SALES_STAFF,
      } as any);
      expect(results).toEqual([]);
    });

    it('exact barcode match scores SCORE_EXACT_CODE + BOOST_PRODUCT + BOOST_EXACT_MATCH', async () => {
      const mockProduct = { id: 'p1', name: 'Widget', barcode: 'BC-001' };
      productRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockProduct]),
      } as any);

      const results = await service.searchGlobal('BC-001', adminUser);

      expect(results[0].score).toBe(146);
    });

    it('exact name match scores SCORE_EXACT_NAME + BOOST_PRODUCT + BOOST_EXACT_MATCH', async () => {
      const mockProduct = { id: 'p1', name: 'Widget', barcode: 'BC-999' };
      productRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockProduct]),
      } as any);

      const results = await service.searchGlobal('widget', adminUser);

      expect(results[0].score).toBe(121);
    });

    it('barcode exact match outranks name exact match', async () => {
      const mockProduct = { id: 'p1', name: 'widget', barcode: 'widget' };
      productRepository.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockProduct]),
      } as any);

      const results = await service.searchGlobal('widget', adminUser);

      expect(results[0].score).toBe(146);
    });

    it('falls back to fuzzy search when ILIKE returns empty', async () => {
      const fuzzyProduct = { id: 'p2', name: 'Widget Pro', barcode: null };

      let callCount = 0;
      productRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve(callCount === 1 ? [] : [fuzzyProduct]);
        }),
      } as any);

      const results = await service.searchGlobal('Widgt', {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Widget Pro');
      expect(results[0].score).toBe(46);
    });

    it('fuzzy fallback returns empty when no fuzzy matches', async () => {
      productRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      const results = await service.searchGlobal('zzzqqq', {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toEqual([]);
    });
  });

  describe('softDelete', () => {
    it('soft deletes a product with no pending sales orders', async () => {
      productRepository.findOne = jest.fn().mockResolvedValue(createProduct('soft-1'));
      productRepository.softDelete = jest.fn().mockResolvedValue({ affected: 1 } as any);
      const itemQb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };

      const salesOrderItemRepository = (service as any).salesOrderItemRepository;
      salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(itemQb);

      await service.softDelete('soft-1', 'user-1', 'tester');

      expect(productRepository.softDelete).toHaveBeenCalledWith('soft-1');
    });

    it('rejects soft delete when product is in a pending sales order', async () => {
      productRepository.findOne = jest.fn().mockResolvedValue(createProduct('soft-2'));
      const itemQb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      };

      const salesOrderItemRepository = (service as any).salesOrderItemRepository;
      salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(itemQb);

      await expect(service.softDelete('soft-2', 'user-1', 'tester')).rejects.toThrow(
        'Cannot delete',
      );
    });
  });

  describe('findBySlug / findByBarcode relations (#784)', () => {
    const priceList = {
      id: 'pl-1',
      code: 'RETAIL',
      name: 'Retail',
      priority: 1,
      isDefault: true,
      isActive: true,
    } as any;

    const productWithPriceList = createProduct('prod-1', {
      slug: 'product-prod-1',
      priceListItems: [
        {
          id: 'pli-1',
          priceListId: 'pl-1',
          productId: 'prod-1',
          price: 100,
          costBasis: 80,
          marginPercent: 25,
          priceList,
        },
      ] as any,
    });

    it('findBySlug loads priceListItems with priceList relation', async () => {
      productRepository.findOne = jest.fn().mockResolvedValue(productWithPriceList);

      const result = await service.findBySlug('product-prod-1');

      expect(productRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'product-prod-1' },
        relations: { category: true, priceListItems: { priceList: true } },
      });
      expect(result.priceListItems).toHaveLength(1);
      expect(result.priceListItems[0].priceList?.priority).toBe(1);
    });

    it('findByBarcode loads priceListItems with priceList relation', async () => {
      productRepository.findOne = jest.fn().mockResolvedValue(productWithPriceList);

      const result = await service.findByBarcode('SKU-prod-1');

      expect(productRepository.findOne).toHaveBeenCalledWith({
        where: { barcode: 'SKU-prod-1' },
        relations: { category: true, priceListItems: { priceList: true } },
      });
      expect(result.priceListItems).toHaveLength(1);
      expect(result.priceListItems[0].priceList?.priority).toBe(1);
    });

    it('restore reloads the product with priceListItems relation', async () => {
      const restorable = createProduct('prod-1', {
        barcode: null,
        deletedAt: new Date('2026-03-10T00:00:00.000Z'),
        priceListItems: productWithPriceList.priceListItems,
      });
      productRepository.findOne = jest.fn().mockResolvedValue(restorable);
      productRepository.restore = jest.fn().mockResolvedValue(undefined);

      const result = await service.restore('prod-1');

      // Second findOne is the post-restore refetch returned to the client.
      expect(productRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: 'prod-1' },
        relations: { category: true, priceListItems: { priceList: true } },
      });
      expect(result.priceListItems[0].priceList?.priority).toBe(1);
    });

    it('update reloads the product with priceListItems relation', async () => {
      const existing = createProduct('prod-1', {
        priceListItems: productWithPriceList.priceListItems,
      });
      productRepository.findOne = jest.fn().mockResolvedValue(existing);
      productRepository.update = jest.fn().mockResolvedValue(undefined);

      // No name/barcode change → no conflict query builders are invoked.
      const result = await service.update('prod-1', {} as any);

      // Second findOne is the reload returned to the client.
      expect(productRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: 'prod-1' },
        relations: { category: true, priceListItems: { priceList: true } },
      });
      expect(result.priceListItems[0].priceList?.priority).toBe(1);
    });
  });

  describe('update() Stocked→Service block', () => {
    it('rejects GOODS→SERVICE when stockQuantity > 0', async () => {
      const product = createProduct('p1', {
        type: ProductType.GOODS,
        stockQuantity: 5,
      });
      productRepository.findOne.mockResolvedValue(product);

      await expect(
        service.update('p1', { type: ProductType.SERVICE } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('p1', { type: ProductType.SERVICE } as any),
      ).rejects.toThrow(
        'Reduce stock to 0 via a Stock Adjustment before converting to a Service',
      );
    });

    it('allows GOODS→SERVICE when stockQuantity is 0', async () => {
      const loaded = createProduct('p1', {
        type: ProductType.GOODS,
        stockQuantity: 0,
      });
      const reloaded = createProduct('p1', {
        type: ProductType.SERVICE,
        stockQuantity: 0,
      });
      // update() calls findOne twice: initial load, then reload-with-relations.
      productRepository.findOne
        .mockResolvedValueOnce(loaded)
        .mockResolvedValueOnce(reloaded);
      productRepository.update = jest.fn().mockResolvedValue({ affected: 1 });

      const result = await service.update('p1', {
        type: ProductType.SERVICE,
      } as any);

      expect(productRepository.update).toHaveBeenCalledWith('p1', {
        type: ProductType.SERVICE,
      });
      expect(result.type).toBe(ProductType.SERVICE);
    });
  });
});

describe('checkProductDependencies', () => {
  let service: ProductService;

  const makeRepo = (countVal: number) => ({ count: jest.fn().mockResolvedValue(countVal) }) as any;

  const buildModule = async (repoOverrides: { token: any; useValue: any }[] = []) => {
    const defaultProviders = [
      {
        provide: getRepositoryToken(Product),
        useValue: {
          findOne: jest.fn(),
          delete: jest.fn(),
          createQueryBuilder: jest.fn(),
        },
      },
      { provide: getRepositoryToken(Category), useValue: {} },
      { provide: getRepositoryToken(SalesOrderItem), useValue: makeRepo(0) },
      { provide: getRepositoryToken(PurchaseOrderItem), useValue: makeRepo(0) },
      { provide: getRepositoryToken(StockMovement), useValue: makeRepo(0) },
      {
        provide: getRepositoryToken(StockAdjustmentItem),
        useValue: makeRepo(0),
      },
      {
        provide: getRepositoryToken(PurchaseCostHistory),
        useValue: makeRepo(0),
      },
    ];
    const overrideTokens = repoOverrides.map((o) => o.token);
    const mergedProviders = [
      ...defaultProviders.filter((p) => !overrideTokens.includes(p.provide)),
      ...repoOverrides.map((o) => ({ provide: o.token, useValue: o.useValue })),
    ];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        ...mergedProviders,
        { provide: CategoryService, useValue: {} },
        { provide: StockMovementService, useValue: {} },
        { provide: BaseCostCalculatorService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    return module.get(ProductService);
  };

  it('returns no dependencies when only initial_stock movement and cost history exist', async () => {
    const stockMovementRepo = { count: jest.fn().mockResolvedValue(0) };
    service = await buildModule([
      { token: getRepositoryToken(StockMovement), useValue: stockMovementRepo },
    ]);

    const result = await service.checkProductDependencies('product-id');

    expect(result.hasDependencies).toBe(false);
    expect(result.dependencies).toHaveLength(0);
    expect(stockMovementRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productId: 'product-id',
          movementType: Not(StockMovementType.INITIAL_STOCK),
        }),
      }),
    );
  });

  it('returns dependency when a non-initial_stock movement exists', async () => {
    const stockMovementRepo = { count: jest.fn().mockResolvedValue(1) };
    service = await buildModule([
      { token: getRepositoryToken(StockMovement), useValue: stockMovementRepo },
    ]);

    const result = await service.checkProductDependencies('product-id');

    expect(result.hasDependencies).toBe(true);
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ type: 'stock movements' }),
    );
  });

  it('returns dependency when a sales order item exists', async () => {
    const salesOrderItemRepo = { count: jest.fn().mockResolvedValue(2) };
    service = await buildModule([
      {
        token: getRepositoryToken(SalesOrderItem),
        useValue: salesOrderItemRepo,
      },
    ]);

    const result = await service.checkProductDependencies('product-id');

    expect(result.hasDependencies).toBe(true);
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ type: 'sales order items', count: 2 }),
    );
  });

  it('does NOT include purchase_cost_history in dependency check', async () => {
    const purchaseCostHistoryRepo = { count: jest.fn().mockResolvedValue(5) };
    service = await buildModule([
      {
        token: getRepositoryToken(PurchaseCostHistory),
        useValue: purchaseCostHistoryRepo,
      },
    ]);

    const result = await service.checkProductDependencies('product-id');

    expect(result.hasDependencies).toBe(false);
    expect(purchaseCostHistoryRepo.count).not.toHaveBeenCalled();
  });
});

describe('permanentDelete and bulkPermanentDelete cleanup', () => {
  let service: ProductService;

  const softDeletedProduct = {
    id: 'product-id',
    name: 'Test Product',
    barcode: 'SKU-001',
    baseCost: 10,
    stockQuantity: 5,
    deletedAt: new Date(),
  } as any;

  const makeCountRepo = (count = 0) => ({ count: jest.fn().mockResolvedValue(count) }) as any;

  const buildModule = async (repoOverrides: { token: any; useValue: any }[] = []) => {
    const stockMovementRepo = {
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const productRepo = {
      findOne: jest.fn().mockResolvedValue(softDeletedProduct),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    const defaults = [
      { token: getRepositoryToken(Product), useValue: productRepo },
      { token: getRepositoryToken(Category), useValue: {} },
      { token: getRepositoryToken(SalesOrderItem), useValue: makeCountRepo(0) },
      {
        token: getRepositoryToken(PurchaseOrderItem),
        useValue: makeCountRepo(0),
      },
      { token: getRepositoryToken(StockMovement), useValue: stockMovementRepo },
      {
        token: getRepositoryToken(StockAdjustmentItem),
        useValue: makeCountRepo(0),
      },
      {
        token: getRepositoryToken(PurchaseCostHistory),
        useValue: makeCountRepo(0),
      },
    ];

    const overrideTokens = repoOverrides.map((o) => o.token);
    const providers = [
      ...defaults.filter((p) => !overrideTokens.includes(p.token)),
      ...repoOverrides,
    ].map(({ token, useValue }) => ({ provide: token, useValue }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        ...providers,
        { provide: CategoryService, useValue: {} },
        { provide: StockMovementService, useValue: {} },
        { provide: BaseCostCalculatorService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    return {
      service: module.get(ProductService),
      stockMovementRepo,
      productRepo,
    };
  };

  it('permanentDelete deletes initial_stock movement before hard-deleting the product', async () => {
    const { service, stockMovementRepo, productRepo } = await buildModule();

    await service.permanentDelete('product-id', 'user-1', 'admin');

    expect(stockMovementRepo.delete).toHaveBeenCalledWith({
      productId: 'product-id',
      movementType: StockMovementType.INITIAL_STOCK,
    });
    // cleanup must precede the hard delete
    const cleanupOrder = stockMovementRepo.delete.mock.invocationCallOrder[0];
    const deleteOrder = productRepo.delete.mock.invocationCallOrder[0];
    expect(cleanupOrder).toBeLessThan(deleteOrder);
  });

  it('bulkPermanentDelete deletes initial_stock movement before hard-deleting each product', async () => {
    const { service, stockMovementRepo, productRepo } = await buildModule();

    await service.bulkPermanentDelete(['product-id'], 'user-1', 'admin');

    expect(stockMovementRepo.delete).toHaveBeenCalledWith({
      productId: 'product-id',
      movementType: StockMovementType.INITIAL_STOCK,
    });
    const cleanupOrder = stockMovementRepo.delete.mock.invocationCallOrder[0];
    const deleteOrder = productRepo.delete.mock.invocationCallOrder[0];
    expect(cleanupOrder).toBeLessThan(deleteOrder);
  });
});
