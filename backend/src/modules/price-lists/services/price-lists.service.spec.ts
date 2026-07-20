import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceListsService } from './price-lists.service';
import { PriceList, PriceListItem } from '@/database/entities';
import { SettingsService } from '../../settings/settings.service';

describe('PriceListsService', () => {
  let service: PriceListsService;
  let priceListRepository: jest.Mocked<Repository<PriceList>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceListsService,
        {
          provide: getRepositoryToken(PriceList),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PriceListItem),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: { getRegionalSettings: jest.fn().mockResolvedValue({ timezone: 'Asia/Kuala_Lumpur' }) },
        },
      ],
    }).compile();

    service = module.get<PriceListsService>(PriceListsService);
    priceListRepository = module.get(getRepositoryToken(PriceList));
  });

  describe('findAll pagination', () => {
    const createQb = () => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    });

    it('returns full set when page/limit absent', async () => {
      const qb = createQb();
      priceListRepository.createQueryBuilder.mockReturnValue(qb as any);
      await service.findAll({} as any);
      expect(qb.skip).not.toHaveBeenCalled();
    });

    it('paginates when page/limit present', async () => {
      const qb = createQb();
      priceListRepository.createQueryBuilder.mockReturnValue(qb as any);
      await service.findAll({ page: 2, limit: 20 } as any);
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });
});
