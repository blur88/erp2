import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupplierService } from './supplier.service';
import { Supplier } from '../../../database/entities/supplier.entity';
import { AuditLogService } from '../../audit-logs/services';
import { UserRole } from '../../../database/entities/user.entity';

describe('SupplierService.searchGlobal', () => {
  let service: SupplierService;
  let supplierRepository: jest.Mocked<Repository<Supplier>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierService,
        {
          provide: getRepositoryToken(Supplier),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SupplierService);
    supplierRepository = module.get(getRepositoryToken(Supplier));
  });

  it('exact supplier name match scores SCORE_EXACT_NAME + BOOST_SUPPLIER + BOOST_EXACT_MATCH', async () => {
    supplierRepository.createQueryBuilder.mockReturnValue({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'sup-1',
          companyName: 'Acme Supplies',
          phone: '0123456789',
        },
      ]),
    } as any);

    const results = await service.searchGlobal('Acme Supplies', {
      role: UserRole.ADMIN,
    } as any);

    expect(results[0]).toMatchObject({
      type: 'supplier',
      id: 'sup-1',
      label: 'Acme Supplies',
      description: '0123456789',
      route: '/purchasing/suppliers/sup-1',
    });
    expect(results[0].score).toBe(122);
  });
});
