import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from '../../../database/entities/category.entity';
import { Product } from '../../../database/entities/product.entity';
import { AuditLogService } from '../../audit-logs/services';
import { CategoryService } from './category.service';

describe('CategoryService', () => {
  let service: CategoryService;
  let categoryRepository: jest.Mocked<Repository<Category>>;
  let productRepository: jest.Mocked<Repository<Product>>;

  const createCategory = (id: string, overrides: Partial<Category> = {}): Category =>
    ({
      id,
      name: `Category ${id}`,
      path: `Category ${id}`,
      level: 0,
      parentId: null,
      fullPath: `Category ${id}`,
      isRoot: true,
      hasChildren: false,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      deletedAt: null,
      children: [],
      ...overrides,
    }) as Category;

  const createQueryBuilder = (categories: Category[] = []) => ({
    withDeleted: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([categories, categories.length]),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: getRepositoryToken(Category),
          useValue: {
            createQueryBuilder: jest.fn(),
            findAndCount: jest.fn(),
            findOne: jest.fn(),
            restore: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            count: jest.fn().mockResolvedValue(0),
            find: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(CategoryService);
    categoryRepository = module.get(getRepositoryToken(Category));
    productRepository = module.get(getRepositoryToken(Product));
  });

  it('findDeleted applies parentId filtering through the shared query builder path', async () => {
    const qb = createQueryBuilder([
      createCategory('child-1', { parentId: 'parent-1', isRoot: false, level: 1 }),
    ]);
    categoryRepository.createQueryBuilder.mockReturnValue(qb as any);
    categoryRepository.findAndCount.mockResolvedValue([[], 0] as any);

    await service.findDeleted({ parentId: 'parent-1' });

    expect(categoryRepository.createQueryBuilder).toHaveBeenCalledWith('category');
    expect(qb.andWhere).toHaveBeenCalledWith('category.parentId = :parentId', {
      parentId: 'parent-1',
    });
  });

  describe('getCategoryProducts', () => {
    it('returns products for a valid category', async () => {
      categoryRepository.findOne.mockResolvedValue({ id: 'cat-1', name: 'Hardware' } as any);
      productRepository.find.mockResolvedValue([
        { id: 'prod-1', name: 'Widget', stockQuantity: 5 },
        { id: 'prod-2', name: 'Bolt', stockQuantity: 0 },
      ] as any);

      const result = await service.getCategoryProducts('cat-1');

      expect(result).toEqual({
        data: [
          { id: 'prod-1', name: 'Widget', stockQuantity: 5 },
          { id: 'prod-2', name: 'Bolt', stockQuantity: 0 },
        ],
      });
      expect(productRepository.find).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1' },
        select: { id: true, name: true, stockQuantity: true },
      });
    });

    it('returns empty data array for a category with no products', async () => {
      categoryRepository.findOne.mockResolvedValue({ id: 'cat-2', name: 'Empty' } as any);
      productRepository.find.mockResolvedValue([] as any);

      const result = await service.getCategoryProducts('cat-2');

      expect(result).toEqual({ data: [] });
    });

    it('throws NotFoundException for an unknown category ID', async () => {
      categoryRepository.findOne.mockResolvedValue(null);

      await expect(service.getCategoryProducts('no-such-id')).rejects.toThrow(NotFoundException);
    });
  });
});
