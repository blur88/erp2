import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '../entities/expense.entity';
import { ExpensePayment } from '../entities/expense-payment.entity';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { AccountType } from '../entities/account-type.enum';
import { AuditLogService } from '../../audit-logs/services';
import { SettingsService } from '../../settings/settings.service';
import { formatScale4 } from '@/common/utils/money';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let expenseRepo: any;
  let expensePaymentRepo: any;
  let coaRepo: any;
  let settings: jest.Mocked<SettingsService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    expenseRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), createQueryBuilder: jest.fn() };
    expensePaymentRepo = { find: jest.fn() };
    coaRepo = { findOne: jest.fn() };
    settings = { generateDocumentNumber: jest.fn() } as any;
    auditLogService = { log: jest.fn() } as any;
    dataSource = {
      transaction: jest.fn(),
      getRepository: jest.fn().mockReturnValue({ find: jest.fn().mockResolvedValue([]) }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        { provide: getRepositoryToken(Expense), useValue: expenseRepo },
        { provide: getRepositoryToken(ExpensePayment), useValue: expensePaymentRepo },
        { provide: getRepositoryToken(ChartOfAccount), useValue: coaRepo },
        { provide: SettingsService, useValue: settings },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ExpenseService);
  });

  let txAccount: any;
  let txManager: any;

  function setupTxAccount(overrides?: Partial<any>, settingsRow?: any) {
    const defaults = { id: 'acc-1', isActive: true, isPostable: true, type: AccountType.EXPENSE };
    txAccount = { ...defaults, ...overrides };
    const row = settingsRow === undefined
      ? { id: true, cogsAccountId: 'cogs-1', defaultExpenseAccountId: 'acc-1' }
      : settingsRow;
    const expenseRepoObj = { findOne: jest.fn(), create: (x: any) => x, save: async (x: any) => ({ ...x, id: 'exp-1' }) };
    const coaRepoObj = { findOne: jest.fn().mockImplementation(() => { if (txAccount === null) return null; return txAccount; }) };
    const paymentRepoObj = { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) };
    const settingsRepoObj = { findOne: jest.fn().mockResolvedValue(row) };
    txManager = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === Expense) return expenseRepoObj;
        if (entity === ChartOfAccount) return coaRepoObj;
        if (entity === ExpensePayment) return paymentRepoObj;
        if (entity === AccountingSettings) return settingsRepoObj;
        return {};
      }),
    };
    txManager._expenseRepo = expenseRepoObj;
    txManager._paymentRepo = paymentRepoObj;
    txManager._settingsRepo = settingsRepoObj;
    (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(txManager));
    return { manager: txManager, account: txAccount };
  }

  describe('create', () => {
    const validDto = {
      expenseDate: '2026-07-20',
      payee: 'Vendor A',
      description: 'Office supplies',
      expenseAccountId: 'acc-1',
      totalAmount: '1500.0000',
    };

    it('rejects totalAmount <= 0', async () => {
      await expect(service.create({ ...validDto, totalAmount: '0.0000' }, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
      await expect(service.create({ ...validDto, totalAmount: '-100.0000' }, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects missing expense account', async () => {
      setupTxAccount();
      txAccount = null;
      await expect(service.create(validDto, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects inactive account', async () => {
      setupTxAccount({ isActive: false });
      await expect(service.create(validDto, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects non-postable account', async () => {
      setupTxAccount({ isPostable: false });
      await expect(service.create(validDto, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects non-EXPENSE account type', async () => {
      setupTxAccount({ type: AccountType.ASSET });
      await expect(service.create(validDto, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects the configured COGS account', async () => {
      setupTxAccount({ id: 'cogs-1' });
      await expect(service.create({ ...validDto, expenseAccountId: 'cogs-1' }, 'user-1', 'admin'))
        .rejects.toThrow('Cost of Goods Sold is reserved for automatic Sales Order postings and cannot be used for a manual expense');
    });

    it('allows any expense account when no settings row exists', async () => {
      settings.generateDocumentNumber.mockResolvedValue('EXP-26-001');
      setupTxAccount({ id: 'cogs-1' }, null);
      await expect(service.create({ ...validDto, expenseAccountId: 'cogs-1' }, 'user-1', 'admin'))
        .resolves.toBeDefined();
    });

    it('excludes by configured id, not by account code', async () => {
      settings.generateDocumentNumber.mockResolvedValue('EXP-26-001');
      setupTxAccount({ id: 'acc-1', code: '5100' }, { id: true, cogsAccountId: 'other-cogs', defaultExpenseAccountId: 'acc-1' });
      await expect(service.create({ ...validDto, expenseAccountId: 'acc-1' }, 'user-1', 'admin'))
        .resolves.toBeDefined();
    });

    it('creates expense with correct fields inside transaction', async () => {
      settings.generateDocumentNumber.mockResolvedValue('EXP-26-001');
      const { manager } = setupTxAccount();
      const saved = await service.create(validDto, 'user-1', 'admin');
      expect(saved.id).toBe('exp-1');
      expect(saved.expenseNumber).toBe('EXP-26-001');
      expect(saved.totalAmount).toBe('1500.0000');
      expect(saved.balance).toBe('1500.0000');
      expect(saved.paidAmount).toBe('0.0000');
      expect(saved.documentStatus).toBe(ExpenseDocumentStatus.DRAFT);
      expect(saved.paymentStatus).toBe(ExpensePaymentStatus.UNPAID);
      expect(saved.expenseDate).toBe('2026-07-20');
      expect(saved.payee).toBe('Vendor A');
      expect(saved.description).toBe('Office supplies');
      expect(saved.expenseAccountId).toBe('acc-1');
    });

    it('calls generateDocumentNumber inside transaction with manager', async () => {
      settings.generateDocumentNumber.mockResolvedValue('EXP-26-001');
      const { manager } = setupTxAccount();
      await service.create(validDto, 'user-1', 'admin');
      expect(settings.generateDocumentNumber).toHaveBeenCalledWith('Expenses', manager);
    });

    it('writes audit log after creation', async () => {
      settings.generateDocumentNumber.mockResolvedValue('EXP-26-001');
      setupTxAccount();
      await service.create(validDto, 'user-1', 'admin');
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'Expense',
        expect.stringContaining('EXP-26-001'),
        expect.objectContaining({
          entityId: 'exp-1',
          userId: 'user-1',
          username: 'admin',
          newValues: expect.objectContaining({
            totalAmount: '1500.0000',
            expenseAccountId: 'acc-1',
          }),
        }),
      );
    });

    it('uses system as default userId when not provided', async () => {
      settings.generateDocumentNumber.mockResolvedValue('EXP-26-001');
      setupTxAccount();
      await service.create(validDto);
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'Expense',
        expect.any(String),
        expect.objectContaining({ userId: 'system', username: undefined }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when expense not found', async () => {
      expenseRepo.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns expense with remainingRefundable on positive payment rows', async () => {
      const payment1 = { id: 'p1', expenseId: 'exp-1', amount: '1000.0000', paymentDate: '2026-07-20', createdAt: new Date('2026-07-20T10:00:00Z'), sourcePaymentId: null, paymentMethodId: 'pm-1', paymentMethod: { id: 'pm-1', name: 'Cash' } };
      const payment2 = { id: 'p2', expenseId: 'exp-1', amount: '500.0000', paymentDate: '2026-07-21', createdAt: new Date('2026-07-21T10:00:00Z'), sourcePaymentId: null, paymentMethodId: 'pm-2', paymentMethod: { id: 'pm-2', name: 'Bank' } };
      const refund = { id: 'r1', expenseId: 'exp-1', amount: '-200.0000', paymentDate: '2026-07-22', createdAt: new Date('2026-07-22T10:00:00Z'), sourcePaymentId: 'p1', paymentMethodId: 'pm-1', paymentMethod: { id: 'pm-1', name: 'Cash' } };
      expenseRepo.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'exp-1', expenseNumber: 'EXP-26-001', payments: [payment1, refund, payment2], expenseAccount: { id: 'acc-1', name: 'Office Expenses' },
        }),
      });
      const methodRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'pm-1', name: 'Cash', deletedAt: null },
          { id: 'pm-2', name: 'Bank', deletedAt: new Date('2026-07-01') },
        ]),
      };
      (dataSource.getRepository as jest.Mock).mockReturnValue(methodRepo);
      const result = await service.findOne('exp-1');
      expect(result).toBeDefined();
      expect(result.id).toBe('exp-1');
      expect(result.payments).toHaveLength(3);
      // Methods are loaded separately with withDeleted so soft-deleted ones
      // still render on historical rows.
      expect(methodRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
      const p1: any = result.payments.find((p: any) => p.id === 'p1');
      expect(p1.remainingRefundable).toBe('800.0000');
      expect(p1.paymentMethod).toEqual(expect.objectContaining({ id: 'pm-1', name: 'Cash' }));
      const p2: any = result.payments.find((p: any) => p.id === 'p2');
      expect(p2.remainingRefundable).toBe('500.0000');
      expect(p2.paymentMethod).toEqual(expect.objectContaining({ id: 'pm-2', name: 'Bank' }));
      const r1: any = result.payments.find((p: any) => p.id === 'r1');
      expect(r1.remainingRefundable).toBeUndefined();
    });

    it('computes remainingRefundable as zero when fully refunded', async () => {
      const payment = { id: 'p1', expenseId: 'exp-1', amount: '500.0000', paymentDate: '2026-07-20', createdAt: new Date('2026-07-20T10:00:00Z'), sourcePaymentId: null, paymentMethodId: 'pm-1', paymentMethod: { id: 'pm-1', name: 'Cash' } };
      const refund1 = { id: 'r1', expenseId: 'exp-1', amount: '-300.0000', paymentDate: '2026-07-21', createdAt: new Date('2026-07-21T10:00:00Z'), sourcePaymentId: 'p1', paymentMethodId: 'pm-1', paymentMethod: { id: 'pm-1', name: 'Cash' } };
      const refund2 = { id: 'r2', expenseId: 'exp-1', amount: '-200.0000', paymentDate: '2026-07-22', createdAt: new Date('2026-07-22T10:00:00Z'), sourcePaymentId: 'p1', paymentMethodId: 'pm-1', paymentMethod: { id: 'pm-1', name: 'Cash' } };
      expenseRepo.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'exp-1', expenseNumber: 'EXP-26-001', payments: [payment, refund1, refund2], expenseAccount: { id: 'acc-1' },
        }),
      });
      const result = await service.findOne('exp-1');
      const p1: any = result.payments.find((p: any) => p.id === 'p1');
      expect(p1.remainingRefundable).toBe('0.0000');
    });
  });

  describe('list', () => {
    function makeQb() {
      const calls: { sql: string; params: any }[] = [];
      const order: string[] = [];
      const qb: any = {
        calls, order,
        leftJoinAndSelect: () => qb,
        andWhere: (sql: string, params?: any) => { calls.push({ sql, params }); order.push('andWhere'); return qb; },
        orderBy: (col: string, dir: string) => { qb._orderBy = { col, dir }; order.push('orderBy'); return qb; },
        addOrderBy: (col: string, dir: string) => { qb._addOrderBy = { col, dir }; order.push('addOrderBy'); return qb; },
        skip: (n: number) => { qb._skip = n; order.push('skip'); return qb; },
        take: (n: number) => { qb._take = n; order.push('take'); return qb; },
        getManyAndCount: async () => { order.push('getManyAndCount'); return [qb._result ?? [], qb._total ?? 0]; },
        getMany: async () => { order.push('getMany'); return qb._result ?? []; },
        _result: [{ id: 'exp-1', expenseNumber: 'EXP-26-001' }],
        _total: 1,
      };
      return qb;
    }

    function buildQb(qb: any) {
      expenseRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    }

    it('returns full data without pagination when no page/limit', async () => {
      const qb = makeQb();
      buildQb(qb);
      const result = await service.list({});
      expect(qb.order.includes('getMany')).toBe(true);
      expect(qb.order.includes('skip')).toBe(false);
      expect(qb.order.includes('take')).toBe(false);
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns paginated result when page and limit provided', async () => {
      const qb = makeQb();
      buildQb(qb);
      const result = await service.list({ page: 1, limit: 10 });
      expect(qb._skip).toBe(0);
      expect(qb._take).toBe(10);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect((result as any).meta.total).toBe(1);
      expect((result as any).meta.page).toBe(1);
      expect((result as any).meta.limit).toBe(10);
    });

    it('applies ILIKE search over expenseNumber/description/payee', async () => {
      const qb = makeQb();
      buildQb(qb);
      await service.list({ search: 'office' });
      const where = qb.calls.find((c: any) => c.sql.includes('ILIKE'));
      expect(where).toBeDefined();
      expect(where.sql).toMatch(/expenseNumber.*ILIKE/);
      expect(where.sql).toMatch(/description.*ILIKE/);
      expect(where.sql).toMatch(/payee.*ILIKE/);
      expect(where.params).toEqual({ search: '%office%' });
    });

    it('applies date range filter', async () => {
      const qb = makeQb();
      buildQb(qb);
      await service.list({ fromDate: '2026-01-01', toDate: '2026-07-31' });
      expect(qb.calls.some((c: any) => c.sql.includes('>=') && c.params?.fromDate === '2026-01-01')).toBe(true);
      expect(qb.calls.some((c: any) => c.sql.includes('<=') && c.params?.toDate === '2026-07-31')).toBe(true);
    });

    it('applies expenseAccountId filter', async () => {
      const qb = makeQb();
      buildQb(qb);
      await service.list({ expenseAccountId: 'acc-1' });
      expect(qb.calls.some((c: any) => c.params?.expenseAccountId === 'acc-1')).toBe(true);
    });

    it('applies documentStatus filter', async () => {
      const qb = makeQb();
      buildQb(qb);
      await service.list({ documentStatus: 'DRAFT' });
      expect(qb.calls.some((c: any) => c.params?.documentStatus === 'DRAFT')).toBe(true);
    });

    it('applies paymentStatus filter', async () => {
      const qb = makeQb();
      buildQb(qb);
      await service.list({ paymentStatus: 'UNPAID' });
      expect(qb.calls.some((c: any) => c.params?.paymentStatus === 'UNPAID')).toBe(true);
    });

    it('defaults to expenseDate DESC, createdAt DESC', async () => {
      const qb = makeQb();
      buildQb(qb);
      await service.list({});
      expect(qb._orderBy).toEqual({ col: 'e.expenseDate', dir: 'DESC' });
      expect(qb._addOrderBy).toEqual({ col: 'e.createdAt', dir: 'DESC' });
    });

    it('applies custom sortBy and sortOrder', async () => {
      const qb = makeQb();
      buildQb(qb);
      await service.list({ sortBy: 'totalAmount', sortOrder: 'ASC' });
      expect(qb._orderBy).toEqual({ col: 'e.totalAmount', dir: 'ASC' });
    });

    it('applies custom sort with default order DESC', async () => {
      const qb = makeQb();
      buildQb(qb);
      await service.list({ sortBy: 'expenseNumber' });
      expect(qb._orderBy).toEqual({ col: 'e.expenseNumber', dir: 'DESC' });
    });
  });

  describe('computeAggregates', () => {
    it('returns UNPAID when no payments', () => {
      const result = ExpenseService.computeAggregates('1000.0000', []);
      expect(result.paymentStatus).toBe(ExpensePaymentStatus.UNPAID);
      expect(result.paidAmount).toBe('0.0000');
      expect(result.balance).toBe('1000.0000');
    });

    it('returns PAID when paid >= total', () => {
      const result = ExpenseService.computeAggregates('1000.0000', [
        { amount: '600.0000' }, { amount: '400.0000' },
      ]);
      expect(result.paymentStatus).toBe(ExpensePaymentStatus.PAID);
      expect(result.paidAmount).toBe('1000.0000');
      expect(result.balance).toBe('0.0000');
    });

    it('returns PARTIAL when 0 < paid < total', () => {
      const result = ExpenseService.computeAggregates('1000.0000', [{ amount: '300.0000' }]);
      expect(result.paymentStatus).toBe(ExpensePaymentStatus.PARTIAL);
      expect(result.paidAmount).toBe('300.0000');
      expect(result.balance).toBe('700.0000');
    });
  });

  describe('computeAggregates payment status bands', () => {
    it('returns UNPAID when nothing is paid', () => {
      const r = ExpenseService.computeAggregates('100.0000', []);
      expect(r.paymentStatus).toBe(ExpensePaymentStatus.UNPAID);
      expect(r.paidAmount).toBe('0.0000');
      expect(r.balance).toBe('100.0000');
    });

    it('returns PARTIAL when paid is below total', () => {
      const r = ExpenseService.computeAggregates('100.0000', [{ amount: '40.0000' }]);
      expect(r.paymentStatus).toBe(ExpensePaymentStatus.PARTIAL);
      expect(r.balance).toBe('60.0000');
    });

    it('returns PAID on exact payment', () => {
      const r = ExpenseService.computeAggregates('100.0000', [{ amount: '100.0000' }]);
      expect(r.paymentStatus).toBe(ExpensePaymentStatus.PAID);
      expect(r.balance).toBe('0.0000');
    });

    it('returns OVERPAID with a negative balance when paid exceeds total', () => {
      const r = ExpenseService.computeAggregates('100.0000', [{ amount: '130.0000' }]);
      expect(r.paymentStatus).toBe(ExpensePaymentStatus.OVERPAID);
      expect(r.paidAmount).toBe('130.0000');
      expect(r.balance).toBe('-30.0000');
    });
  });

  describe('update', () => {
    function mockLockedExpense(overrides: Partial<any> = {}) {
      return {
        id: 'exp-1',
        expenseNumber: 'EXP-26-001',
        totalAmount: '1000.0000',
        paidAmount: '0.0000',
        balance: '1000.0000',
        documentStatus: ExpenseDocumentStatus.DRAFT,
        paymentStatus: ExpensePaymentStatus.UNPAID,
        expenseAccountId: 'acc-1',
        expenseDate: '2026-07-20',
        payee: 'Vendor A',
        description: 'Office supplies',
        notes: null,
        ...overrides,
      };
    }

    function setupUpdateTest(overrides: Partial<any> = {}) {
      const expense = mockLockedExpense(overrides);
      setupTxAccount();
      txManager.getRepository(Expense).findOne.mockResolvedValue(expense);
      return expense;
    }

    it('throws NotFoundException when expense does not exist', async () => {
      setupTxAccount();
      txManager.getRepository(Expense).findOne.mockResolvedValue(null);
      await expect(service.update('nonexistent', { description: 'test' }, 'user-1', 'admin'))
        .rejects.toThrow(NotFoundException);
    });

    it('rejects CANCELLED documentStatus', async () => {
      setupUpdateTest({ documentStatus: ExpenseDocumentStatus.CANCELLED });
      await expect(service.update('exp-1', { description: 'Changed' }, 'user-1', 'admin'))
        .rejects.toThrow('Cancelled expenses cannot be edited');
    });

    it('rejects PAID paymentStatus', async () => {
      setupUpdateTest({ paymentStatus: ExpensePaymentStatus.PAID });
      await expect(service.update('exp-1', { description: 'Changed' }, 'user-1', 'admin'))
        .rejects.toThrow('Fully paid expenses cannot be edited');
    });

    it('refuses to edit an OVERPAID expense, like a PAID one', async () => {
      // Arrange an expense whose paymentStatus is OVERPAID using the suite's
      // existing lockRowForUpdate mock, then attempt an update.
      setupUpdateTest({ paymentStatus: ExpensePaymentStatus.OVERPAID });
      await expect(
        service.update('exp-overpaid', { totalAmount: '200.0000' } as any),
      ).rejects.toThrow('Fully paid expenses cannot be edited');
    });

    it('rejects totalAmount <= 0', async () => {
      setupUpdateTest();
      await expect(service.update('exp-1', { totalAmount: '0.0000' }, 'user-1', 'admin'))
        .rejects.toThrow('Amount must be greater than zero');
    });

    it('rejects totalAmount < paidAmount', async () => {
      setupUpdateTest({ paidAmount: '500.0000' });
      await expect(service.update('exp-1', { totalAmount: '400.0000' }, 'user-1', 'admin'))
        .rejects.toThrow('Amount cannot be less than the amount already paid');
    });

    it('rejects expenseAccountId change when payment exists', async () => {
      setupUpdateTest();
      txManager.getRepository(ExpensePayment).count.mockResolvedValue(1);
      await expect(service.update('exp-1', { expenseAccountId: 'acc-2' }, 'user-1', 'admin'))
        .rejects.toThrow('Expense account is locked after the first payment');
    });

    it('re-validates account when expenseAccountId changes - not found', async () => {
      setupUpdateTest();
      txAccount = null;
      await expect(service.update('exp-1', { expenseAccountId: 'acc-2' }, 'user-1', 'admin'))
        .rejects.toThrow('Expense account not found');
    });

    it('re-validates account when expenseAccountId changes - not active', async () => {
      setupUpdateTest();
      txAccount = { id: 'acc-2', isActive: false, isPostable: true, type: AccountType.EXPENSE };
      await expect(service.update('exp-1', { expenseAccountId: 'acc-2' }, 'user-1', 'admin'))
        .rejects.toThrow('Expense account is not active');
    });

    it('allows editing a COGS-linked expense when the account is unchanged', async () => {
      setupUpdateTest({ expenseAccountId: 'cogs-1' });
      await expect(service.update('exp-1', { description: 'Changed' }, 'user-1', 'admin'))
        .resolves.toBeDefined();
    });

    it('rejects changing an expense account to the configured COGS account', async () => {
      setupUpdateTest({ expenseAccountId: 'acc-1' });
      await expect(service.update('exp-1', { expenseAccountId: 'cogs-1' }, 'user-1', 'admin'))
        .rejects.toThrow('Cost of Goods Sold is reserved for automatic Sales Order postings and cannot be used for a manual expense');
    });

    it('recomputes aggregates when totalAmount decreases from PARTIAL to PAID', async () => {
      setupUpdateTest({ totalAmount: '1000.0000', paidAmount: '500.0000', balance: '500.0000', paymentStatus: ExpensePaymentStatus.PARTIAL });
      txManager.getRepository(ExpensePayment).find.mockResolvedValue([{ amount: '500.0000' }]);
      const result = await service.update('exp-1', { totalAmount: '500.0000' }, 'user-1', 'admin');
      expect(result.totalAmount).toBe('500.0000');
      expect(result.paidAmount).toBe('500.0000');
      expect(result.balance).toBe('0.0000');
      expect(result.paymentStatus).toBe(ExpensePaymentStatus.PAID);
    });

    it('updates allowed fields and writes audit log', async () => {
      setupUpdateTest();
      const result = await service.update('exp-1', { description: 'Updated desc', payee: 'New Vendor', notes: 'Note added' }, 'user-1', 'admin');
      expect(result.description).toBe('Updated desc');
      expect(result.payee).toBe('New Vendor');
      expect(result.notes).toBe('Note added');
      expect(auditLogService.log).toHaveBeenCalledWith(
        'UPDATE', 'Expense', expect.stringContaining('EXP-26-001'),
        expect.objectContaining({ entityId: 'exp-1', userId: 'user-1', username: 'admin' }),
      );
    });

    it('uses system as default userId when not provided', async () => {
      setupUpdateTest();
      await service.update('exp-1', { description: 'test' });
      expect(auditLogService.log).toHaveBeenCalledWith(
        'UPDATE', 'Expense', expect.any(String),
        expect.objectContaining({ userId: 'system', username: undefined }),
      );
    });
  });

  describe('cancel', () => {
    function setupCancelTest(overrides: Partial<any> = {}) {
      const expense = {
        id: 'exp-1',
        expenseNumber: 'EXP-26-001',
        totalAmount: '1000.0000',
        paidAmount: '0.0000',
        balance: '1000.0000',
        documentStatus: ExpenseDocumentStatus.DRAFT,
        paymentStatus: ExpensePaymentStatus.UNPAID,
        expenseAccountId: 'acc-1',
        expenseDate: '2026-07-20',
        payee: 'Vendor A',
        description: 'Office supplies',
        notes: null,
        ...overrides,
      };
      setupTxAccount();
      txManager.getRepository(Expense).findOne.mockResolvedValue(expense);
      return expense;
    }

    it('throws NotFoundException when expense does not exist', async () => {
      setupTxAccount();
      txManager.getRepository(Expense).findOne.mockResolvedValue(null);
      await expect(service.cancel('nonexistent', 'user-1', 'admin'))
        .rejects.toThrow(NotFoundException);
    });

    it('rejects non-DRAFT status', async () => {
      setupCancelTest({ documentStatus: ExpenseDocumentStatus.CANCELLED });
      await expect(service.cancel('exp-1', 'user-1', 'admin'))
        .rejects.toThrow('Only draft expenses can be cancelled');
    });

    it('rejects net paid != 0', async () => {
      setupCancelTest({ paidAmount: '500.0000' });
      await expect(service.cancel('exp-1', 'user-1', 'admin'))
        .rejects.toThrow('Refund all payments before cancelling this expense');
    });

    it('sets documentStatus to CANCELLED and writes audit log', async () => {
      setupCancelTest();
      const repo = txManager.getRepository(Expense);
      repo.save = jest.fn().mockImplementation(async (x: any) => x);
      const result = await service.cancel('exp-1', 'user-1', 'admin');
      expect(result.documentStatus).toBe(ExpenseDocumentStatus.CANCELLED);
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CANCEL', 'Expense', expect.stringContaining('EXP-26-001'),
        expect.objectContaining({ entityId: 'exp-1', userId: 'user-1', username: 'admin' }),
      );
    });

    it('uses system as default userId when not provided', async () => {
      setupCancelTest();
      await service.cancel('exp-1');
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CANCEL', 'Expense', expect.any(String),
        expect.objectContaining({ userId: 'system', username: undefined }),
      );
    });
  });

  describe('deriveDocumentStatus', () => {
    const D = ExpenseDocumentStatus;
    const P = ExpensePaymentStatus;

    it('settles to COMPLETED when fully paid', () => {
      expect(ExpenseService.deriveDocumentStatus(D.DRAFT, P.PAID)).toBe(D.COMPLETED);
    });

    it('settles to COMPLETED when overpaid', () => {
      expect(ExpenseService.deriveDocumentStatus(D.DRAFT, P.OVERPAID)).toBe(D.COMPLETED);
    });

    it('reopens to DRAFT when no longer fully settled', () => {
      expect(ExpenseService.deriveDocumentStatus(D.COMPLETED, P.PARTIAL)).toBe(D.DRAFT);
      expect(ExpenseService.deriveDocumentStatus(D.COMPLETED, P.UNPAID)).toBe(D.DRAFT);
    });

    it('keeps COMPLETED while still fully settled', () => {
      expect(ExpenseService.deriveDocumentStatus(D.COMPLETED, P.PAID)).toBe(D.COMPLETED);
      expect(ExpenseService.deriveDocumentStatus(D.COMPLETED, P.OVERPAID)).toBe(D.COMPLETED);
    });

    it('keeps DRAFT while unsettled', () => {
      expect(ExpenseService.deriveDocumentStatus(D.DRAFT, P.UNPAID)).toBe(D.DRAFT);
      expect(ExpenseService.deriveDocumentStatus(D.DRAFT, P.PARTIAL)).toBe(D.DRAFT);
    });

    it('preserves CANCELLED against every payment status', () => {
      for (const p of [P.UNPAID, P.PARTIAL, P.PAID, P.OVERPAID]) {
        expect(ExpenseService.deriveDocumentStatus(D.CANCELLED, p)).toBe(D.CANCELLED);
      }
    });
  });
});
