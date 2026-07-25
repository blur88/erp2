import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '../entities/expense.entity';
import { ExpensePayment } from '../entities/expense-payment.entity';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountType } from '../entities/account-type.enum';
import { AuditLogService } from '../../audit-logs/services';
import { SettingsService } from '../../settings/settings.service';
import { formatScale4 } from '../utils/money';

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
    dataSource = { transaction: jest.fn() } as any;

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

  function setupTxAccount(overrides?: Partial<any>) {
    const defaults = { id: 'acc-1', isActive: true, isPostable: true, type: AccountType.EXPENSE };
    txAccount = { ...defaults, ...overrides };
    txManager = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === Expense) return {
          findOne: jest.fn(),
          create: (x: any) => x,
          save: async (x: any) => ({ ...x, id: 'exp-1' }),
        };
        if (entity === ChartOfAccount) return {
          findOne: jest.fn().mockImplementation(() => {
            if (txAccount === null) return null;
            return txAccount;
          }),
        };
        return {};
      }),
    };
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
      expenseRepo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns expense with remainingRefundable on positive payment rows', async () => {
      const payment1 = { id: 'p1', expenseId: 'exp-1', amount: '1000.0000', paymentDate: '2026-07-20', createdAt: new Date('2026-07-20T10:00:00Z'), sourcePaymentId: null, paymentMethod: { id: 'pm-1', name: 'Cash' } };
      const payment2 = { id: 'p2', expenseId: 'exp-1', amount: '500.0000', paymentDate: '2026-07-21', createdAt: new Date('2026-07-21T10:00:00Z'), sourcePaymentId: null, paymentMethod: { id: 'pm-2', name: 'Bank' } };
      const refund = { id: 'r1', expenseId: 'exp-1', amount: '200.0000', paymentDate: '2026-07-22', createdAt: new Date('2026-07-22T10:00:00Z'), sourcePaymentId: 'p1', paymentMethod: { id: 'pm-1', name: 'Cash' } };
      expenseRepo.findOne = jest.fn().mockResolvedValue({
        id: 'exp-1', expenseNumber: 'EXP-26-001', payments: [payment1, refund, payment2], expenseAccount: { id: 'acc-1', name: 'Office Expenses' },
      });
      const result = await service.findOne('exp-1');
      expect(result).toBeDefined();
      expect(result.id).toBe('exp-1');
      expect(result.payments).toHaveLength(3);
      const p1: any = result.payments.find((p: any) => p.id === 'p1');
      expect(p1.remainingRefundable).toBe('800.0000');
      const p2: any = result.payments.find((p: any) => p.id === 'p2');
      expect(p2.remainingRefundable).toBe('500.0000');
      const r1: any = result.payments.find((p: any) => p.id === 'r1');
      expect(r1.remainingRefundable).toBeUndefined();
    });

    it('computes remainingRefundable as zero when fully refunded', async () => {
      const payment = { id: 'p1', expenseId: 'exp-1', amount: '500.0000', paymentDate: '2026-07-20', createdAt: new Date('2026-07-20T10:00:00Z'), sourcePaymentId: null, paymentMethod: { id: 'pm-1', name: 'Cash' } };
      const refund1 = { id: 'r1', expenseId: 'exp-1', amount: '300.0000', paymentDate: '2026-07-21', createdAt: new Date('2026-07-21T10:00:00Z'), sourcePaymentId: 'p1', paymentMethod: { id: 'pm-1', name: 'Cash' } };
      const refund2 = { id: 'r2', expenseId: 'exp-1', amount: '200.0000', paymentDate: '2026-07-22', createdAt: new Date('2026-07-22T10:00:00Z'), sourcePaymentId: 'p1', paymentMethod: { id: 'pm-1', name: 'Cash' } };
      expenseRepo.findOne = jest.fn().mockResolvedValue({
        id: 'exp-1', expenseNumber: 'EXP-26-001', payments: [payment, refund1, refund2], expenseAccount: { id: 'acc-1' },
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
      expect(where.sql).toMatch(/expenseNumber.*ILIKE|description.*ILIKE|payee.*ILIKE/);
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
});
