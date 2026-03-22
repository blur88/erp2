import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoiceService } from './invoice.service';
import { Invoice } from '../../../database/entities/invoice.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Product } from '../../../database/entities/product.entity';
import { InvoiceItem } from '../../../database/entities/invoice-item.entity';
import { AuditLogService } from '../../audit-logs/services';
import { UserRole } from '../../../database/entities/user.entity';

describe('InvoiceService.searchGlobal', () => {
  let service: InvoiceService;
  let invoiceRepository: { createQueryBuilder: jest.Mock };

  const mockQb = () => ({
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  });

  beforeEach(async () => {
    invoiceRepository = { createQueryBuilder: jest.fn().mockReturnValue(mockQb()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepository },
        { provide: getRepositoryToken(Customer), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(SalesOrder), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(InvoiceItem), useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn(), createLog: jest.fn() } },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  it('returns empty for non-sales role', async () => {
    const result = await service.searchGlobal('INV-001', {
      role: UserRole.INVENTORY_STAFF,
    } as any);

    expect(result).toEqual([]);
    expect(invoiceRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns matching invoices as GlobalSearchResultDto', async () => {
    const mockInvoice = {
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      customer: { name: 'ABC Corp' },
    };
    const qb = mockQb();
    qb.getMany.mockResolvedValue([mockInvoice]);
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    const results = await service.searchGlobal('INV-001', {
      role: UserRole.SALES_STAFF,
    } as any);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'invoice',
      id: 'inv-1',
      label: 'INV-001',
      route: '/sales/invoices/inv-1',
    });
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('falls back to fuzzy when ILIKE returns empty', async () => {
    const fuzzyInvoice = {
      id: 'inv-2',
      invoiceNumber: 'INV-002',
      customer: { name: 'XYZ Ltd' },
    };
    let callCount = 0;
    const qb = mockQb();
    qb.getMany.mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? [] : [fuzzyInvoice]);
    });
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    const results = await service.searchGlobal('INV-00', {
      role: UserRole.SALES_STAFF,
    } as any);

    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(49);
  });
});
