import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PriceListsModule } from '../../src/modules/price-lists/price-lists.module';
import { PriceList } from '../../src/database/entities/price-list.entity';
import { PriceListItem } from '../../src/database/entities/price-list-item.entity';
import { Product } from '../../src/database/entities/product.entity';

describe('PriceListsController (e2e)', () => {
  let app: INestApplication;

  const mockPriceList = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Retail Price List',
    code: 'RETAIL',
    description: 'Standard retail prices',
    isDefault: true,
    isActive: true,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    items: [],
  };

  const mockPriceListRepository = {
    find: jest.fn().mockResolvedValue([mockPriceList]),
    findOne: jest.fn().mockResolvedValue(mockPriceList),
    findOneBy: jest.fn().mockResolvedValue(mockPriceList),
    save: jest.fn().mockResolvedValue(mockPriceList),
    create: jest.fn().mockReturnValue(mockPriceList),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(1),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockPriceList]),
      getOne: jest.fn().mockResolvedValue(mockPriceList),
      getManyAndCount: jest.fn().mockResolvedValue([[mockPriceList], 1]),
    })),
  };

  const mockPriceListItemRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn(),
    })),
  };

  const mockProductRepository = {
    findOneBy: jest.fn(),
    findByIds: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PriceListsModule],
    })
      .overrideProvider(getRepositoryToken(PriceList))
      .useValue(mockPriceListRepository)
      .overrideProvider(getRepositoryToken(PriceListItem))
      .useValue(mockPriceListItemRepository)
      .overrideProvider(getRepositoryToken(Product))
      .useValue(mockProductRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/price-lists', () => {
    it('should return paginated price lists', () => {
      return request(app.getHttpServer())
        .get('/api/price-lists')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should filter by active status', () => {
      return request(app.getHttpServer())
        .get('/api/price-lists?isActive=true')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
        });
    });

    it('should support pagination', () => {
      return request(app.getHttpServer())
        .get('/api/price-lists?page=1&limit=10')
        .expect(200)
        .expect((res) => {
          expect(res.body.meta).toHaveProperty('currentPage', 1);
          expect(res.body.meta).toHaveProperty('itemsPerPage', 10);
        });
    });
  });

  describe('GET /api/price-lists/:id', () => {
    it('should return a single price list', () => {
      return request(app.getHttpServer())
        .get(`/api/price-lists/${mockPriceList.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('name');
        });
    });

    it('should return 404 for non-existent price list', () => {
      mockPriceListRepository.createQueryBuilder().getOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .get('/api/price-lists/non-existent-id')
        .expect(404);
    });
  });

  describe('GET /api/price-lists/code/:code', () => {
    it('should return price list by code', () => {
      return request(app.getHttpServer())
        .get('/api/price-lists/code/RETAIL')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('code', 'RETAIL');
        });
    });

    it('should return 404 for non-existent code', () => {
      mockPriceListRepository.findOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .get('/api/price-lists/code/NON_EXISTENT')
        .expect(404);
    });
  });

  describe('POST /api/price-lists', () => {
    it('should create a new price list', () => {
      const createDto = {
        name: 'Wholesale Price List',
        code: 'WHOLESALE',
        description: 'Wholesale prices',
        isDefault: false,
        isActive: true,
        effectiveFrom: '2026-01-01',
      };

      mockPriceListRepository.findOneBy.mockResolvedValueOnce(null);
      mockPriceListRepository.save.mockResolvedValueOnce({ ...createDto, id: 'new-id' });

      return request(app.getHttpServer())
        .post('/api/price-lists')
        .send(createDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('name', createDto.name);
        });
    });

    it('should return 400 for invalid data', () => {
      const invalidDto = {
        name: '',
        code: '',
      };

      return request(app.getHttpServer())
        .post('/api/price-lists')
        .send(invalidDto)
        .expect(400);
    });

    it('should return 409 for duplicate code', () => {
      const createDto = {
        name: 'Duplicate',
        code: 'RETAIL',
        isDefault: false,
        isActive: true,
      };

      mockPriceListRepository.findOneBy.mockResolvedValueOnce(mockPriceList);

      return request(app.getHttpServer())
        .post('/api/price-lists')
        .send(createDto)
        .expect(409);
    });
  });

  describe('PATCH /api/price-lists/:id', () => {
    it('should update a price list', () => {
      const updateDto = {
        name: 'Updated Price List',
        description: 'Updated description',
      };

      mockPriceListRepository.save.mockResolvedValueOnce({ ...mockPriceList, ...updateDto });

      return request(app.getHttpServer())
        .patch(`/api/price-lists/${mockPriceList.id}`)
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('name', updateDto.name);
        });
    });

    it('should return 404 for non-existent price list', () => {
      mockPriceListRepository.findOneBy.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .patch('/api/price-lists/non-existent-id')
        .send({ name: 'Update' })
        .expect(404);
    });
  });

  describe('DELETE /api/price-lists/:id', () => {
    it('should soft delete a price list', () => {
      return request(app.getHttpServer())
        .delete(`/api/price-lists/${mockPriceList.id}`)
        .expect(200);
    });
  });

  describe('POST /api/price-lists/:id/set-default', () => {
    it('should set a price list as default', () => {
      mockPriceListRepository.findOne.mockResolvedValueOnce(null);
      mockPriceListRepository.save.mockResolvedValueOnce({ ...mockPriceList, isDefault: true });

      return request(app.getHttpServer())
        .post(`/api/price-lists/${mockPriceList.id}/set-default`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('isDefault', true);
        });
    });
  });

  describe('GET /api/price-lists/effective', () => {
    it('should return effective price lists', () => {
      return request(app.getHttpServer())
        .get('/api/price-lists/effective')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('GET /api/price-lists/default', () => {
    it('should return default price list', () => {
      return request(app.getHttpServer())
        .get('/api/price-lists/default')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('isDefault', true);
        });
    });
  });

  describe('GET /api/price-lists/:id/items', () => {
    it('should return price list items', () => {
      return request(app.getHttpServer())
        .get(`/api/price-lists/${mockPriceList.id}/items`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('POST /api/price-lists/:id/items/bulk', () => {
    it('should bulk update prices', () => {
      const bulkDto = {
        items: [
          {
            productId: 'product-123',
            unitPrice: 120.00,
            costBasis: 90.00,
            marginPercent: 33.33,
          },
        ],
      };

      mockProductRepository.findByIds.mockResolvedValueOnce([{ id: 'product-123' }]);
      mockPriceListItemRepository.findOne.mockResolvedValueOnce(null);
      mockPriceListItemRepository.save.mockResolvedValueOnce({});

      return request(app.getHttpServer())
        .post(`/api/price-lists/${mockPriceList.id}/items/bulk`)
        .send(bulkDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('updated');
          expect(res.body).toHaveProperty('failed');
        });
    });
  });

  describe('POST /api/price-lists/:id/copy', () => {
    it('should copy a price list', () => {
      const copyDto = {
        name: 'Copied Price List',
        code: 'COPIED',
      };

      mockPriceListRepository.findOne.mockResolvedValueOnce(null);
      mockPriceListRepository.save.mockResolvedValueOnce({ ...mockPriceList, ...copyDto, id: 'copied-id' });

      return request(app.getHttpServer())
        .post(`/api/price-lists/${mockPriceList.id}/copy`)
        .send(copyDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('name', copyDto.name);
        });
    });
  });

  describe('POST /api/price-lists/:id/adjust', () => {
    it('should apply percentage adjustment', () => {
      const adjustDto = {
        adjustmentPercent: 10,
      };

      mockPriceListItemRepository.find.mockResolvedValueOnce([
        { id: 'item-1', unitPrice: 100.00 },
      ]);
      mockPriceListItemRepository.save.mockResolvedValueOnce({});

      return request(app.getHttpServer())
        .post(`/api/price-lists/${mockPriceList.id}/adjust`)
        .send(adjustDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('updated');
        });
    });

    it('should return 400 for invalid adjustment', () => {
      const invalidDto = {
        adjustmentPercent: -101,
      };

      return request(app.getHttpServer())
        .post(`/api/price-lists/${mockPriceList.id}/adjust`)
        .send(invalidDto)
        .expect(400);
    });
  });

  describe('GET /api/price-lists/:id/products/:productId', () => {
    it('should return price for specific product', () => {
      mockPriceListItemRepository.createQueryBuilder().getOne.mockResolvedValueOnce({
        id: 'item-1',
        unitPrice: 100.00,
        productId: 'product-123',
      });

      return request(app.getHttpServer())
        .get(`/api/price-lists/${mockPriceList.id}/products/product-123`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('unitPrice');
        });
    });

    it('should return null for non-existent product price', () => {
      mockPriceListItemRepository.createQueryBuilder().getOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .get(`/api/price-lists/${mockPriceList.id}/products/non-existent`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toBeNull();
        });
    });
  });
});
