import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductService } from './product.service';
import { Product, ProductType } from '../../../database/entities/product.entity';
import { Category } from '../../../database/entities/category.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { StockAdjustmentItem } from '../../../database/entities/stock-adjustment.entity';
import { GoodsReceivedNoteItem } from '../../../database/entities/goods-received-note-item.entity';
import { InvoiceItem } from '../../../database/entities/invoice-item.entity';
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
          },
        },
        { provide: getRepositoryToken(Category), useValue: {} },
        { provide: getRepositoryToken(SalesOrderItem), useValue: {} },
        { provide: getRepositoryToken(PurchaseOrderItem), useValue: {} },
        { provide: getRepositoryToken(StockMovement), useValue: {} },
        { provide: getRepositoryToken(StockAdjustmentItem), useValue: {} },
        { provide: getRepositoryToken(GoodsReceivedNoteItem), useValue: {} },
        { provide: getRepositoryToken(InvoiceItem), useValue: {} },
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
      expect(() => (service as any).parseCsvContent({ length: 2 })).toThrow('CSV content must be a string');
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
      expect(() => (service as any).parseCsvLine({ length: 8192 })).toThrow('CSV line must be a string');
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
    const products = [createProduct('deleted-1', { deletedAt: new Date('2026-03-10T00:00:00.000Z') })];
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
      createProduct('deleted-2', { deletedAt: new Date('2026-03-11T00:00:00.000Z') }),
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
});
