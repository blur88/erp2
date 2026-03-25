import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerService } from './customer.service';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { AuditLogService } from '../../audit-logs/services';
import { TransactionManager } from '../../../common/utils/transaction.util';
import { UserRole } from '../../../database/entities/user.entity';

describe('CustomerService', () => {
  let service: CustomerService;
  let customerRepository: jest.Mocked<Repository<Customer>>;
  const adminUser = { role: UserRole.ADMIN } as any;

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
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
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

    it('exact phone match scores SCORE_EXACT_CODE + BOOST_CUSTOMER + BOOST_EXACT_MATCH', async () => {
      const mockCustomer = {
        id: 'c1',
        name: 'Acme Corp',
        phone: '0123456789',
      };

      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCustomer]),
      } as any);

      const results = await service.searchGlobal('0123456789', adminUser);

      expect(results[0].score).toBe(148);
    });

    it('exact name match scores SCORE_EXACT_NAME + BOOST_CUSTOMER + BOOST_EXACT_MATCH', async () => {
      const mockCustomer = { id: 'c1', name: 'acme corp', phone: null };

      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCustomer]),
      } as any);

      const results = await service.searchGlobal('acme corp', adminUser);

      expect(results[0].score).toBe(123);
    });

    it('phone exact match outranks name exact match', async () => {
      const mockCustomer = { id: 'c1', name: 'acme corp', phone: 'acme corp' };

      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCustomer]),
      } as any);

      const results = await service.searchGlobal('acme corp', adminUser);

      expect(results[0].score).toBe(148);
    });

    it('falls back to fuzzy search when ILIKE returns empty', async () => {
      const fuzzyCustomer = { id: 'c2', name: 'Acme Corp', phone: null };

      let callCount = 0;
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve(callCount === 1 ? [] : [fuzzyCustomer]);
        }),
      } as any);

      const results = await service.searchGlobal('Akme', {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Acme Corp');
      expect(results[0].score).toBe(48);
    });

    it('fuzzy fallback returns empty when no fuzzy matches', async () => {
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
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
});
