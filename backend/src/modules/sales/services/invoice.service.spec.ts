import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoiceService } from './invoice.service';
import { Invoice } from '../../../database/entities/invoice.entity';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Product } from '../../../database/entities/product.entity';
import { InvoiceItem } from '../../../database/entities/invoice-item.entity';
import { AuditLogService } from '../../audit-logs/services';
import { UserRole } from '../../../database/entities/user.entity';
import { SettingsService } from '../../settings/settings.service';

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
        { provide: SettingsService, useValue: { generateDocumentNumber: jest.fn() } },
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

  it('exact invoice number match scores SCORE_EXACT_CODE + BOOST_INVOICE + BOOST_EXACT_MATCH', async () => {
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

    expect(results[0].score).toBe(149);
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

describe('InvoiceService.findAll - new filter params', () => {
  let service: InvoiceService;
  let invoiceRepository: {
    createQueryBuilder: jest.Mock;
    findAndCount: jest.Mock;
  };

  const mockQb = () => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  });

  beforeEach(async () => {
    invoiceRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb()),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

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
        { provide: SettingsService, useValue: { generateDocumentNumber: jest.fn() } },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  it('calls andWhere with paidAmount = 0 when paymentStatus=unpaid', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ paymentStatus: 'unpaid' } as any);

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount = 0'))).toBe(true);
  });

  it('calls andWhere with partial condition when paymentStatus=partial', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ paymentStatus: 'partial' } as any);

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(
      calls.some(
        (c: string) =>
          c.includes('paidAmount > 0') && c.includes('paidAmount < invoice.totalAmount'),
      ),
    ).toBe(true);
  });

  it('calls andWhere with paid condition when paymentStatus=paid', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ paymentStatus: 'paid' } as any);

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount >= invoice.totalAmount'))).toBe(
      true,
    );
  });

  it('calls andWhere with overpaid condition when paymentStatus=overpaid', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ paymentStatus: 'overpaid' } as any);

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount > invoice.totalAmount'))).toBe(
      true,
    );
  });

  it('calls andWhere with isFulfilled = true when fulfillmentStatus=fulfilled', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ fulfillmentStatus: 'fulfilled' } as any);

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('isFulfilled = true'))).toBe(true);
  });

  it('calls andWhere with isFulfilled = false when fulfillmentStatus=unfulfilled', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ fulfillmentStatus: 'unfulfilled' } as any);

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('isFulfilled = false'))).toBe(true);
  });

  it('applies no paymentStatus andWhere when paymentStatus is undefined', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({} as any);

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount'))).toBe(false);
  });

  it('falls back to invoiceDate when sortBy is not allowlisted', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ sortBy: 'drop table invoices', sortOrder: 'ASC' } as any);

    expect(qb.orderBy).toHaveBeenCalledWith('invoice.invoiceDate', 'ASC');
  });
});

describe('InvoiceService.softDelete', () => {
  let service: InvoiceService;
  let invoiceRepository: {
    findOne: jest.Mock;
    softDelete: jest.Mock;
  };
  let paymentRepository: {
    count: jest.Mock;
  };

  beforeEach(async () => {
    invoiceRepository = {
      findOne: jest.fn(),
      softDelete: jest.fn(),
    };
    paymentRepository = {
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepository },
        { provide: getRepositoryToken(Customer), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(SalesOrder), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: paymentRepository },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(InvoiceItem), useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn(), createLog: jest.fn() } },
        { provide: SettingsService, useValue: { generateDocumentNumber: jest.fn() } },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  it('soft deletes a draft invoice with no payments', async () => {
    invoiceRepository.findOne.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      status: InvoiceStatus.DRAFT,
      paidAmount: 0,
    });
    paymentRepository.count.mockResolvedValue(0);
    invoiceRepository.softDelete.mockResolvedValue({ affected: 1 });

    await service.softDelete('inv-1', 'user-1', 'tester');

    expect(invoiceRepository.softDelete).toHaveBeenCalledWith('inv-1');
  });

  it('rejects soft delete when invoice is not draft', async () => {
    invoiceRepository.findOne.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      status: InvoiceStatus.PAID,
      paidAmount: 0,
    });

    await expect(service.softDelete('inv-1', 'user-1', 'tester')).rejects.toThrow(
      'Can only delete invoices that are in DRAFT status',
    );
  });
});

describe('InvoiceService.create', () => {
  let service: InvoiceService;
  let invoiceRepository: jest.Mocked<any>;
  let customerRepository: jest.Mocked<any>;
  let settingsService: jest.Mocked<Pick<SettingsService, 'generateDocumentNumber'>>;

  beforeEach(async () => {
    invoiceRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    customerRepository = { findOne: jest.fn() };
    settingsService = { generateDocumentNumber: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepository },
        { provide: getRepositoryToken(Customer), useValue: customerRepository },
        { provide: getRepositoryToken(SalesOrder), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(InvoiceItem), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn(), createLog: jest.fn() } },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  it('calls generateDocumentNumber("Invoices") when creating an invoice', async () => {
    const dto = {
      customerId: 'cust-1',
      totalAmount: 500,
    };
    customerRepository.findOne.mockResolvedValue({ id: 'cust-1', name: 'Test' });
    settingsService.generateDocumentNumber.mockResolvedValue('INV-26-001');
    const mockInvoice = { id: 'inv-1', invoiceNumber: 'INV-26-001' };
    invoiceRepository.create.mockReturnValue(mockInvoice);
    invoiceRepository.save.mockResolvedValue(mockInvoice);
    invoiceRepository.findOne.mockResolvedValue({
      ...mockInvoice,
      customer: { id: 'cust-1', name: 'Test' },
      items: [],
    });

    await service.create(dto as any);

    expect(settingsService.generateDocumentNumber).toHaveBeenCalledWith('Invoices');
    expect(invoiceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceNumber: 'INV-26-001' }),
    );
  });
});
