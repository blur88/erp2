import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockMovementService } from './stock-movement.service';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { Product } from '../../../database/entities/product.entity';
import { ProductService } from './product.service';

describe('StockMovementService', () => {
  let service: StockMovementService;
  let stockMovementRepository: jest.Mocked<Repository<StockMovement>>;
  let productRepository: jest.Mocked<Repository<Product>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementService,
        {
          provide: getRepositoryToken(StockMovement),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: ProductService,
          useValue: {
            updateStockQuantity: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StockMovementService>(StockMovementService);
    stockMovementRepository = module.get(getRepositoryToken(StockMovement));
    productRepository = module.get(getRepositoryToken(Product));

    // Silence logger output during tests
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deleteByReference', () => {
    it('returns deletedCount 0 when there are no movements', async () => {
      stockMovementRepository.find.mockResolvedValue([]);

      const result = await service.deleteByReference('sales_order', 'order-1');

      expect(result.deletedCount).toBe(0);
    });

    it('deleteByReference reads movements through the supplied manager', async () => {
      const find = jest.fn().mockResolvedValue([]); // no movements → early return { deletedCount: 0 }
      const manager = {
        getRepository: jest.fn().mockReturnValue({ find }),
      } as any;

      const result = await service.deleteByReference(
        'sales_order',
        'order-1',
        manager,
      );

      expect(manager.getRepository).toHaveBeenCalled();
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { referenceType: 'sales_order', referenceId: 'order-1' },
        }),
      );
      expect(result).toEqual({ deletedCount: 0 });
    });
  });
});
