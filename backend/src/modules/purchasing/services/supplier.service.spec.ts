import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupplierService } from './supplier.service';
import { Supplier, SupplierType } from '../../../database/entities/supplier.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';

import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import { AuditLogService } from '../../audit-logs/services';
import { UserRole } from '../../../database/entities/user.entity';

describe('SupplierService', () => {
  let service: SupplierService;
  let supplierRepository: jest.Mocked<Repository<Supplier>>;

  const createSupplier = (id: string, overrides: Partial<Supplier> = {}): Supplier =>
    ({
      id,
      type: SupplierType.LOCAL,
      companyName: `Supplier ${id}`,
      contactPerson: `Contact ${id}`,
      phone: '0123456789',
      email: null,
      billingStreetAddress: null,
      billingStreetAddress2: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null,
      billingCountry: null,
      shippingStreetAddress: null,
      shippingStreetAddress2: null,
      shippingCity: null,
      shippingState: null,
      shippingPostalCode: null,
      shippingCountry: null,
      totalPurchases: 125.5,
      totalOrders: 4,
      averageOrderValue: 31.375,
      lastPurchaseDate: null,
      firstPurchaseDate: null,
      notes: null,
      isActive: true,
      createdAt: new Date('2026-04-05T00:00:00.000Z'),
      updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    }) as Supplier;

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
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findAndCount: jest.fn(),
          },
        },

        {
          provide: getRepositoryToken(VendorPayment),
          useValue: {
            findAndCount: jest.fn(),
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

  describe('findAll', () => {
    it('returns paginated suppliers with customer-style metadata and billing/shipping fields', async () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            createSupplier('1', {
              email: 'supplier@example.com',
              billingStreetAddress: '12 Billing Road',
              billingCity: 'Billing City',
              shippingStreetAddress: '34 Shipping Road',
              shippingCity: 'Shipping City',
            }),
            createSupplier('2'),
          ],
          17,
        ]),
      };
      supplierRepository.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.findAll({ search: 'Supplier', page: 2, limit: 10 });

      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.getManyAndCount).toHaveBeenCalled();
      expect(result).toEqual({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: '1',
            companyName: 'Supplier 1',
            email: 'supplier@example.com',
            billingStreetAddress: '12 Billing Road',
            billingCity: 'Billing City',
            shippingStreetAddress: '34 Shipping Road',
            shippingCity: 'Shipping City',
          }),
          expect.objectContaining({ id: '2', companyName: 'Supplier 2' }),
        ]),
        meta: { total: 17, page: 2, limit: 10 },
      });
    });

    it('findDeleted returns all deleted suppliers without skip/take pagination', async () => {
      const qb = {
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          createSupplier('deleted-1', { deletedAt: new Date('2026-04-05T00:00:00.000Z') }),
        ]),
      };
      supplierRepository.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.findDeleted({});

      expect(qb.skip).not.toHaveBeenCalled();
      expect(qb.take).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: [
          expect.objectContaining({ id: 'deleted-1', companyName: 'Supplier deleted-1' }),
        ],
        meta: { total: 1 },
      });
    });
  });

  describe('searchGlobal', () => {
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
});
