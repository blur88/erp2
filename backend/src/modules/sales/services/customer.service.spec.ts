import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerService } from './customer.service';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { AuditLogService } from '../../audit-logs/services';
import { TransactionManager } from '../../../common/utils/transaction.util';

describe('CustomerService', () => {
  let service: CustomerService;
  let customerRepository: jest.Mocked<Repository<Customer>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: TransactionManager,
          useValue: { runInTransaction: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CustomerService>(CustomerService);
    customerRepository = module.get(getRepositoryToken(Customer));
  });

  describe('searchGlobal', () => {
    it('returns matching customers as GlobalSearchResultDto', async () => {
      const customer = {
        id: 'uuid-1',
        name: 'ABC Trading',
        phone: '0123456789',
        deletedAt: null,
      };
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([customer]),
      } as any);

      const results = await service.searchGlobal('ABC', {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'customer',
        id: 'uuid-1',
        label: 'ABC Trading',
        description: '0123456789',
        route: '/sales/customers/uuid-1',
      });
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('returns empty array when no matches', async () => {
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      const results = await service.searchGlobal('zzz', {
        role: UserRole.SALES_STAFF,
      } as any);
      expect(results).toEqual([]);
    });
  });
});
import { UserRole } from '../../../database/entities/user.entity';
