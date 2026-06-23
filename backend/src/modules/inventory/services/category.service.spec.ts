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
            find: jest.fn(),
            findBy: jest.fn(),
            save: jest.fn(),
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

  describe('findAll pagination', () => {
    it('returns full set when page/limit absent', async () => {
      const cats = [createCategory('c1'), createCategory('c2')];
      const qb = createQueryBuilder(cats);
      categoryRepository.createQueryBuilder.mockReturnValue(qb as any);
      await service.findAll({} as any);
      expect(qb.skip).not.toHaveBeenCalled();
    });

    it('paginates when page/limit present', async () => {
      const cats = [createCategory('c1')];
      const qb = createQueryBuilder(cats);
      categoryRepository.createQueryBuilder.mockReturnValue(qb as any);
      await service.findAll({ page: 2, limit: 20 } as any);
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
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

  describe('generateUniqueSlug', () => {
    it('returns base slug when no collision', async () => {
      jest.spyOn(categoryRepository, 'findOne').mockResolvedValue(null as any);
      await expect((service as any).generateUniqueSlug('Electronics')).resolves.toBe('electronics');
    });
    it('suffixes with -1, -2 on collision', async () => {
      const findOne = jest.spyOn(categoryRepository, 'findOne');
      findOne.mockResolvedValueOnce({ id: 'x' } as any)
             .mockResolvedValueOnce({ id: 'y' } as any)
             .mockResolvedValueOnce(null as any);
      await expect((service as any).generateUniqueSlug('Electronics')).resolves.toBe('electronics-2');
    });
  });

  describe('findBySlug', () => {
    it('returns an inactive (isEnabled=false) category', async () => {
      jest.spyOn(categoryRepository, 'findOne').mockResolvedValue({ id: 'a', name: 'Old', slug: 'old', isEnabled: false } as any);
      const result = await service.findBySlug('old');
      expect(result.isEnabled).toBe(false);
    });
    it('throws NotFound when slug missing', async () => {
      jest.spyOn(categoryRepository, 'findOne').mockResolvedValue(null as any);
      await expect(service.findBySlug('nope')).rejects.toThrow(NotFoundException);
    });
    it('loads and maps the parent (id/name/slug) for view/edit pages', async () => {
      const child = { id: 'c', name: 'Child', slug: 'child', isEnabled: true, parentId: 'p' } as any;
      const parent = { id: 'p', name: 'Parent', slug: 'parent' } as any;
      jest.spyOn(categoryRepository, 'findOne').mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 'p' ? parent : where.id === 'c' || where.slug === 'child' ? { ...child, parent } : null),
      );
      const result = await service.findBySlug('child');
      expect(result.parent).toEqual({ id: 'p', name: 'Parent', slug: 'parent' });
    });
  });

  describe('moveCategory', () => {
    it('updates moved category own path before save', async () => {
      const moved = { id: 'c', name: 'C', parentId: null, level: 0, path: 'C' } as any;
      const newParent = { id: 'b', name: 'B', parentId: null, level: 1, path: 'A.B' } as any;

      categoryRepository.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 'c' ? moved : where.id === 'b' ? newParent : null),
      );
      categoryRepository.find.mockResolvedValue([] as any);
      const saveSpy = categoryRepository.save.mockImplementation((c: any) => Promise.resolve(c));

      await service.moveCategory('c', { newParentId: 'b' } as any);

      const savedArg = saveSpy.mock.calls[0][0] as any;
      expect(savedArg.path).toBe('A.B.C');
    });
  });

  describe('resolveFullPaths', () => {
    it('resolves a nested chain to "A > B > C"', async () => {
      const a = { id: 'a', name: 'Electronics', parentId: null } as any;
      const b = { id: 'b', name: 'Mobile Phones', parentId: 'a' } as any;
      const c = { id: 'c', name: 'Cases', parentId: 'b' } as any;
      jest.spyOn(categoryRepository, 'findOne').mockImplementation(({ where }: any) =>
        Promise.resolve(({ a, b, c } as any)[where.id]),
      );

      const map = await service.resolveFullPaths(['c']);
      expect(map.get('c')).toBe('Electronics > Mobile Phones > Cases');
    });

    it('resolves a root category to its own name', async () => {
      const a = { id: 'a', name: 'Electronics', parentId: null } as any;
      jest.spyOn(categoryRepository, 'findOne').mockResolvedValue(a);
      const map = await service.resolveFullPaths(['a']);
      expect(map.get('a')).toBe('Electronics');
    });
  });

  describe('toResponseDto tree render', () => {
    it('builds child fullPath from parent prefix in tree render', async () => {
      const root = {
        id: 'a', name: 'Electronics', slug: 'electronics', level: 0, parentId: null,
        isEnabled: true, isRoot: true, hasChildren: true, createdAt: new Date(), updatedAt: new Date(),
        children: [{
          id: 'b', name: 'Phones', slug: 'phones', level: 1, parentId: 'a',
          isEnabled: true, isRoot: false, hasChildren: false, createdAt: new Date(), updatedAt: new Date(), children: [],
        }],
      } as any;
      const dto = await (service as any).toResponseDto(root, true, false, root.name);
      expect(dto.fullPath).toBe('Electronics');
      expect(dto.children[0].fullPath).toBe('Electronics > Phones');
    });
  });

  describe('setEnabled', () => {
    it('blocks disabling when a direct enabled child exists', async () => {
      jest.spyOn(categoryRepository, 'findOne').mockResolvedValue({ id: 'p', name: 'Parent', isEnabled: true } as any);
      jest.spyOn(categoryRepository, 'find').mockResolvedValue([{ id: 'c', name: 'Child', isEnabled: true }] as any);
      await expect(service.setEnabled('p', false)).rejects.toThrow(/Child/);
    });
    it('allows disabling with no enabled children', async () => {
      jest.spyOn(categoryRepository, 'findOne').mockResolvedValue({ id: 'p', name: 'Parent', isEnabled: true, slug: 'parent' } as any);
      jest.spyOn(categoryRepository, 'find').mockResolvedValue([] as any);
      jest.spyOn(categoryRepository, 'save').mockResolvedValue({ id: 'p', name: 'Parent', isEnabled: false, slug: 'parent' } as any);
      const result = await service.setEnabled('p', false);
      expect(result.isEnabled).toBe(false);
    });
  });
});
