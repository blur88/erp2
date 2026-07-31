import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Not, DataSource, EntityManager } from 'typeorm';
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

/**
 * Mock DataSource whose `transaction()` runs the callback with a stub EntityManager.
 * `getRepository` returns whatever repo stub the caller registers, so tests can assert
 * that writes went through the manager-owned repository rather than the injected one.
 */
const createMockDataSource = (repos: Map<any, any> = new Map()) => {
  const manager = {
    getRepository: jest.fn((entity: any) => repos.get(entity) ?? {}),
  } as unknown as EntityManager;

  return {
    manager,
    dataSource: {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<any>) => cb(manager)),
    },
  };
};

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
        { provide: CategoryService, useValue: { resolveFullPaths: jest.fn().mockResolvedValue(new Map()) } },
        { provide: StockMovementService, useValue: {} },
        { provide: BaseCostCalculatorService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: DataSource, useValue: createMockDataSource().dataSource },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProductService);
    productRepository = module.get(getRepositoryToken(Product));
    (service as any).categoryService = module.get(CategoryService);
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

  it('product list maps category.fullPath from resolved ancestor map', async () => {
    const categoryService = (service as any).categoryService;
    (categoryService.resolveFullPaths as jest.Mock).mockResolvedValue(
      new Map([['cat1', 'Electronics > Phones']]),
    );
    const product = {
      id: 'p1', slug: 'widget', name: 'Widget', baseCost: 1, stockQuantity: 0,
      categoryId: 'cat1', category: { id: 'cat1', name: 'Phones' },
    } as any;
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[product], 1]),
    };
    productRepository.createQueryBuilder.mockReturnValue(qb as any);

    const res = await service.findAll({} as any);
    expect(res.data[0].category.fullPath).toBe('Electronics > Phones');
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
        { provide: CategoryService, useValue: { resolveFullPaths: jest.fn().mockResolvedValue(new Map()) } },
        { provide: StockMovementService, useValue: {} },
        { provide: BaseCostCalculatorService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: DataSource, useValue: createMockDataSource().dataSource },
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
        { provide: CategoryService, useValue: { resolveFullPaths: jest.fn().mockResolvedValue(new Map()) } },
        { provide: StockMovementService, useValue: {} },
        { provide: BaseCostCalculatorService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: DataSource, useValue: createMockDataSource().dataSource },
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

describe('create() transaction wrap (#978)', () => {
  let service: ProductService;
  let managerProductRepo: any;
  let stockMovementService: { recordInitialStock: jest.Mock };
  let baseCostCalculator: { addStock: jest.Mock };
  let auditLogService: { log: jest.Mock };
  let mockManager: EntityManager;
  let mockDataSource: { transaction: jest.Mock };

  const category = { id: 'category-1', name: 'Category' } as Category;

  const baseDto = {
    name: 'Widget',
    barcode: 'SKU-1',
    categoryId: 'category-1',
    baseCost: 10,
    stockQuantity: 5,
  } as any;

  beforeEach(async () => {
    managerProductRepo = {
      save: jest.fn(async (p: any) => ({ ...p, id: 'product-1' })),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const repos = new Map<any, any>([[Product, managerProductRepo]]);
    const mocked = createMockDataSource(repos);
    mockManager = mocked.manager;
    mockDataSource = mocked.dataSource;

    stockMovementService = { recordInitialStock: jest.fn().mockResolvedValue({}) };
    baseCostCalculator = { addStock: jest.fn().mockResolvedValue({}) };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    // Injected (non-transactional) product repo: serves the pre-checks only.
    const injectedProductRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
      create: jest.fn((p: any) => p),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getRepositoryToken(Product), useValue: injectedProductRepo },
        {
          provide: getRepositoryToken(Category),
          useValue: { findOne: jest.fn().mockResolvedValue(category) },
        },
        { provide: getRepositoryToken(SalesOrderItem), useValue: {} },
        { provide: getRepositoryToken(PurchaseOrderItem), useValue: {} },
        { provide: getRepositoryToken(StockMovement), useValue: {} },
        { provide: getRepositoryToken(StockAdjustmentItem), useValue: {} },
        { provide: getRepositoryToken(PurchaseCostHistory), useValue: {} },
        {
          provide: CategoryService,
          useValue: { resolveFullPaths: jest.fn().mockResolvedValue(new Map()) },
        },
        { provide: StockMovementService, useValue: stockMovementService },
        { provide: BaseCostCalculatorService, useValue: baseCostCalculator },
        { provide: SettingsService, useValue: {} },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
    // generateUniqueSlug hits the repository; stub it to keep these tests focused.
    jest.spyOn(service as any, 'generateUniqueSlug').mockResolvedValue('widget');
  });

  it('aborts the transaction and reports a stable code when the stock movement fails', async () => {
    stockMovementService.recordInitialStock.mockRejectedValue(new Error('movement exploded'));

    await expect(service.create(baseDto, 'user-1', 'tester')).rejects.toMatchObject({
      response: {
        error: 'INITIAL_INVENTORY_SETUP_FAILED',
        message:
          "Product couldn't be created because the initial inventory setup failed. " +
          'No changes were saved. Please try again.',
      },
    });

    // The transaction callback rejected, so cost history never ran and nothing was committed.
    expect(baseCostCalculator.addStock).not.toHaveBeenCalled();
    // Post-commit work must not run.
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('aborts the transaction when the cost history write fails', async () => {
    baseCostCalculator.addStock.mockRejectedValue(new Error('cost history exploded'));

    await expect(service.create(baseDto, 'user-1', 'tester')).rejects.toMatchObject({
      response: { error: 'INITIAL_INVENTORY_SETUP_FAILED' },
    });

    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('issues every write against the transactional manager', async () => {
    await service.create(baseDto, 'user-1', 'tester');

    // The product save runs on the manager-owned repository, not the injected one.
    expect(mockManager.getRepository).toHaveBeenCalledWith(Product);
    expect(managerProductRepo.save).toHaveBeenCalled();

    // The collaborators receive the manager as their trailing argument.
    expect(stockMovementService.recordInitialStock).toHaveBeenCalledWith(
      'product-1',
      5,
      10,
      'user-1',
      mockManager,
    );
    expect(baseCostCalculator.addStock).toHaveBeenCalledWith(
      'product-1',
      null,
      5,
      10,
      0,
      expect.any(Date),
      mockManager,
    );
  });

  it('writes the audit log only after the transaction resolves', async () => {
    const order: string[] = [];
    mockDataSource.transaction.mockImplementation(async (cb: any) => {
      const result = await cb(mockManager);
      order.push('transaction');
      return result;
    });
    auditLogService.log.mockImplementation(async () => {
      order.push('audit');
    });

    await service.create(baseDto, 'user-1', 'tester');

    expect(order).toEqual(['transaction', 'audit']);
  });

  it('passes pre-check failures through untranslated', async () => {
    const productRepo = (service as any).productRepository;
    productRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'existing', deletedAt: null }),
    }));

    await expect(service.create(baseDto, 'user-1', 'tester')).rejects.toThrow(ConflictException);
    // The pre-check throws before any write, so the transaction never opened.
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('sets stockQuantity directly and records no movement for system users', async () => {
    await service.create(baseDto, undefined, undefined);

    expect(stockMovementService.recordInitialStock).not.toHaveBeenCalled();
    expect(managerProductRepo.update).toHaveBeenCalledWith('product-1', { stockQuantity: 5 });
  });

  it('preserves category and stockQuantity on the response', async () => {
    const result = await service.create(baseDto, 'user-1', 'tester');

    expect(result.category).not.toBeNull();
    expect(result.category).toMatchObject({ id: 'category-1', name: 'Category' });
    expect(result.stockQuantity).toBe(5);
  });
});
