import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { ExpensePaymentService } from './expense-payment.service';
import { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '../entities/expense.entity';
import { ExpensePayment } from '../entities/expense-payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { ExpenseService } from './expense.service';
import { AccountingPostingService } from './accounting-posting.service';
import { AuditLogService } from '../../audit-logs/services';
import { toMinorUnits, formatScale4 } from '@/common/utils/money';

describe('ExpensePaymentService', () => {
  let service: ExpensePaymentService;
  let dataSource: jest.Mocked<DataSource>;
  let expenseService: jest.Mocked<ExpenseService>;
  let posting: jest.Mocked<AccountingPostingService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    dataSource = { transaction: jest.fn() } as any;
    expenseService = { findOne: jest.fn() } as any;
    posting = { postExpensePayment: jest.fn().mockResolvedValue({ journalEntryId: 'je-1' }), postExpenseRefund: jest.fn().mockResolvedValue({ journalEntryId: 'je-2' }) } as any;
    auditLogService = { log: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensePaymentService,
        { provide: DataSource, useValue: dataSource },
        { provide: ExpenseService, useValue: expenseService },
        { provide: AccountingPostingService, useValue: posting },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(ExpensePaymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function lockedExpense(overrides: Partial<any> = {}) {
    return {
      id: 'exp-1',
      expenseNumber: 'EXP-26-001',
      totalAmount: '1500.0000',
      paidAmount: '0.0000',
      balance: '1500.0000',
      expenseAccountId: 'acc-1',
      documentStatus: ExpenseDocumentStatus.DRAFT,
      ...overrides,
    };
  }

  function cashMethod() {
    return { id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true, useForPurchases: true, accountingChannel: 'CASH' };
  }

  function bankMethod() {
    return { id: 'pm-2', code: 'BANK', name: 'Bank Transfer', isActive: true, useForPurchases: true, accountingChannel: 'BANK' };
  }

  let savedPayments: any[];
  let txExpenseRepo: any;
  let txPmRepo: any;
  let txPayRepo: any;
  let txManager: any;

  function setupTx(overrides: {
    expenseOverrides?: Partial<any>;
    paymentMethods?: Record<string, any>;
    allPayments?: any[];
  } = {}) {
    const exp = lockedExpense(overrides.expenseOverrides);
    savedPayments = [];

    txExpenseRepo = {
      findOne: jest.fn().mockResolvedValue(exp),
      update: jest.fn().mockResolvedValue({}),
    };

    const pmMap = overrides.paymentMethods ?? { 'pm-1': cashMethod(), 'pm-2': bankMethod() };
    txPmRepo = {
      findOne: jest.fn().mockImplementation((opts: any) => {
        const id = opts.where.id;
        const method = pmMap[id];
        if (!method) return Promise.resolve(null);
        if (opts.where.isActive !== undefined && method.isActive !== opts.where.isActive) return Promise.resolve(null);
        if (opts.where.useForPurchases !== undefined && method.useForPurchases !== opts.where.useForPurchases) return Promise.resolve(null);
        return Promise.resolve(method);
      }),
    };

    txPayRepo = {
      create: jest.fn((x: any) => ({ ...x })),
      save: jest.fn(async (x: any) => {
        const row = { ...x, id: `pay-${savedPayments.length + 1}` };
        savedPayments.push(row);
        return row;
      }),
      find: jest.fn(async (opts: any) => {
        if (opts?.where?.id) {
          return savedPayments.filter(p => p.id === opts.where.id);
        }
        return overrides.allPayments ?? savedPayments;
      }),
    };

    txManager = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === Expense) return txExpenseRepo;
        if (entity === PaymentMethodEntity) return txPmRepo;
        if (entity === ExpensePayment) return txPayRepo;
        return {};
      }),
    };

    (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(txManager));

    return { manager: txManager, expense: exp };
  }

  describe('pay', () => {
    const validDto = {
      payments: [
        { paymentMethodId: 'pm-1', amount: '1000.0000', paymentDate: '2026-07-20', reference: 'REF-001' },
        { paymentMethodId: 'pm-2', amount: '500.0000', paymentDate: '2026-07-21' },
      ],
    };

    it('rejects empty payments array', async () => {
      await expect(service.pay('exp-1', { payments: [] }, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects null/undefined payments', async () => {
      await expect(service.pay('exp-1', {} as any, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects any row amount <= 0', async () => {
      await expect(service.pay('exp-1', { payments: [{ paymentMethodId: 'pm-1', amount: '0.0000', paymentDate: '2026-07-20' }] }, 'user-1', 'admin'))
        .rejects.toThrow('Payment amount must be greater than zero');

      await expect(service.pay('exp-1', { payments: [{ paymentMethodId: 'pm-1', amount: '-100.0000', paymentDate: '2026-07-20' }] }, 'user-1', 'admin'))
        .rejects.toThrow('Payment amount must be greater than zero');
    });

    it('rejects CANCELLED expense inside the lock', async () => {
      setupTx({ expenseOverrides: { documentStatus: ExpenseDocumentStatus.CANCELLED } });
      await expect(service.pay('exp-1', validDto, 'user-1', 'admin'))
        .rejects.toThrow('Cancelled expenses cannot receive payments');
    });

    it('rejects inactive payment method', async () => {
      setupTx({
        paymentMethods: { 'pm-1': { ...cashMethod(), isActive: false } },
      });
      await expect(service.pay('exp-1', { payments: [{ paymentMethodId: 'pm-1', amount: '500.0000', paymentDate: '2026-07-20' }] }, 'user-1', 'admin'))
        .rejects.toThrow('Payment method pm-1 not found, inactive, or not enabled for purchases');
    });

    it('rejects non-purchase payment method', async () => {
      setupTx({
        paymentMethods: { 'pm-1': { ...cashMethod(), useForPurchases: false } },
      });
      await expect(service.pay('exp-1', { payments: [{ paymentMethodId: 'pm-1', amount: '500.0000', paymentDate: '2026-07-20' }] }, 'user-1', 'admin'))
        .rejects.toThrow('Payment method pm-1 not found, inactive, or not enabled for purchases');
    });

    it('accepts an overpayment, recording a negative balance and OVERPAID status', async () => {
      // Arrange the same expense the previous rejection test used (total 1500.0000),
      // then pay more than the outstanding balance.
      setupTx();
      expenseService.findOne.mockResolvedValue({ id: 'exp-1' } as any);

      await service.pay('exp-1', { payments: [{ paymentMethodId: 'pm-1', amount: '1600.0000', paymentDate: '2026-08-05' }] }, 'user-1', 'admin');

      const agg = ExpenseService.computeAggregates('1500.0000', [{ amount: '1600.0000' }]);
      expect(agg.paidAmount).toBe('1600.0000');
      expect(agg.balance).toBe('-100.0000');
      expect(agg.paymentStatus).toBe(ExpensePaymentStatus.OVERPAID);
      expect(txExpenseRepo.update).toHaveBeenCalledWith('exp-1', {
        paidAmount: '1600.0000', balance: '-100.0000', paymentStatus: ExpensePaymentStatus.OVERPAID,
      });
    });

    it('happy path: persists payments, posts JE once per row, recomputes aggregates', async () => {
      const exp = lockedExpense({ balance: '1500.0000' });
      setupTx({ expenseOverrides: exp });
      expenseService.findOne.mockResolvedValue({ id: 'exp-1', expenseNumber: 'EXP-26-001', payments: [] } as any);

      const result = await service.pay('exp-1', validDto, 'user-1', 'admin');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      expect(txExpenseRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }));

      expect(txPayRepo.save).toHaveBeenCalledTimes(2);
      expect(txPayRepo.save).toHaveBeenNthCalledWith(1, expect.objectContaining({
        expenseId: 'exp-1', paymentMethodId: 'pm-1', amount: '1000.0000',
        paymentDate: '2026-07-20', reference: 'REF-001', sourcePaymentId: null,
      }));
      expect(txPayRepo.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
        expenseId: 'exp-1', paymentMethodId: 'pm-2', amount: '500.0000',
        paymentDate: '2026-07-21', reference: null, sourcePaymentId: null,
      }));

      expect(posting.postExpensePayment).toHaveBeenCalledTimes(2);
      expect(posting.postExpensePayment).toHaveBeenNthCalledWith(1, {
        expenseId: 'exp-1', paymentRowId: 'pay-1', expenseAccountId: 'acc-1',
        channel: 'CASH', amount: '1000.0000', sourceRef: 'EXP-26-001',
        entryDate: '2026-07-20', createdBy: 'admin',
      }, txManager);
      expect(posting.postExpensePayment).toHaveBeenNthCalledWith(2, {
        expenseId: 'exp-1', paymentRowId: 'pay-2', expenseAccountId: 'acc-1',
        channel: 'BANK', amount: '500.0000', sourceRef: 'EXP-26-001',
        entryDate: '2026-07-21', createdBy: 'admin',
      }, txManager);

      expect(txPayRepo.find).toHaveBeenCalledWith({ where: { expenseId: 'exp-1' } as any });
      expect(txExpenseRepo.update).toHaveBeenCalledWith('exp-1', {
        paidAmount: '1500.0000', balance: '0.0000', paymentStatus: ExpensePaymentStatus.PAID,
      });

      expect(auditLogService.log).toHaveBeenCalledWith(
        'PAYMENT', 'Expense', expect.stringContaining('EXP-26-001'),
        expect.objectContaining({ entityId: 'exp-1', userId: 'user-1', username: 'admin' }),
      );

      expect(expenseService.findOne).toHaveBeenCalledWith('exp-1');
      expect(result).toBeDefined();
    });

    it('handles partial payment correctly', async () => {
      const exp = lockedExpense({ balance: '1500.0000' });
      setupTx({ expenseOverrides: exp });
      expenseService.findOne.mockResolvedValue({ id: 'exp-1' } as any);

      await service.pay('exp-1', { payments: [{ paymentMethodId: 'pm-1', amount: '600.0000', paymentDate: '2026-07-20' }] }, 'user-1', 'admin');

      expect(txExpenseRepo.update).toHaveBeenCalledWith('exp-1', {
        paidAmount: '600.0000', balance: '900.0000', paymentStatus: ExpensePaymentStatus.PARTIAL,
      });
    });

    it('caches payment method across multiple rows using same method', async () => {
      setupTx();
      expenseService.findOne.mockResolvedValue({ id: 'exp-1' } as any);

      await service.pay('exp-1', {
        payments: [
          { paymentMethodId: 'pm-1', amount: '500.0000', paymentDate: '2026-07-20' },
          { paymentMethodId: 'pm-1', amount: '500.0000', paymentDate: '2026-07-21' },
          { paymentMethodId: 'pm-2', amount: '500.0000', paymentDate: '2026-07-22' },
        ],
      }, 'user-1', 'admin');

      expect(txPmRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('uses system as default userId when not provided', async () => {
      setupTx();
      expenseService.findOne.mockResolvedValue({ id: 'exp-1' } as any);

      await service.pay('exp-1', { payments: [{ paymentMethodId: 'pm-1', amount: '500.0000', paymentDate: '2026-07-20' }] });

      expect(auditLogService.log).toHaveBeenCalledWith(
        'PAYMENT', 'Expense', expect.any(String),
        expect.objectContaining({ userId: 'system', username: undefined }),
      );
    });
  });

  describe('refund', () => {
    const sourcePayment = { id: 'p1', expenseId: 'exp-1', amount: '1000.0000', paymentDate: '2026-07-20', sourcePaymentId: null, paymentMethodId: 'pm-1' };

    const validDto = {
      refunds: [
        { sourcePaymentId: 'p1', amount: '300.0000', refundDate: '2026-07-25', reference: 'REF-R1' },
      ],
    };

    function setupRefundTx(overrides: {
      expenseOverrides?: Partial<any>;
      sourceOverrides?: Partial<any>;
      priorRefunds?: any[];
    } = {}) {
      const prior = overrides.priorRefunds ?? [];
      const source = { ...sourcePayment, ...(overrides.sourceOverrides ?? {}) };

      setupTx({
        expenseOverrides: overrides.expenseOverrides,
        paymentMethods: { 'pm-1': cashMethod() },
      });

      txPayRepo.findOne = jest.fn().mockImplementation(async (opts: any) => {
        const id = opts?.where?.id;
        if (id === 'p1') return source;
        const found = [...savedPayments].find((p: any) => p.id === id);
        return found ?? null;
      });

      txPayRepo.find = jest.fn().mockImplementation(async (opts: any) => {
        const spId = opts?.where?.sourcePaymentId;
        if (spId) return prior;
        return [source, ...savedPayments];
      });
    }

    it('rejects empty refunds array', async () => {
      await expect(service.refund('exp-1', { refunds: [] }, 'user-1', 'admin'))
        .rejects.toThrow('At least one refund row is required');
    });

    it('rejects null/undefined refunds', async () => {
      await expect(service.refund('exp-1', {} as any, 'user-1', 'admin'))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects any row amount <= 0', async () => {
      await expect(service.refund('exp-1', { refunds: [{ sourcePaymentId: 'p1', amount: '0.0000', refundDate: '2026-07-25' }] }, 'user-1', 'admin'))
        .rejects.toThrow('Refund amount must be greater than zero');

      await expect(service.refund('exp-1', { refunds: [{ sourcePaymentId: 'p1', amount: '-50.0000', refundDate: '2026-07-25' }] }, 'user-1', 'admin'))
        .rejects.toThrow('Refund amount must be greater than zero');
    });

    it('rejects CANCELLED expense before source validation, inside lock', async () => {
      setupRefundTx({ expenseOverrides: { documentStatus: ExpenseDocumentStatus.CANCELLED } });
      await expect(service.refund('exp-1', validDto, 'user-1', 'admin'))
        .rejects.toThrow('Cancelled expenses cannot be refunded');
    });

    it('rejects source not found', async () => {
      setupRefundTx();
      txPayRepo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.refund('exp-1', validDto, 'user-1', 'admin'))
        .rejects.toThrow('Refund source must be a payment on this expense');
    });

    it('rejects source belonging to another expense', async () => {
      setupRefundTx({ sourceOverrides: { expenseId: 'exp-other' } });
      await expect(service.refund('exp-1', validDto, 'user-1', 'admin'))
        .rejects.toThrow('Refund source must be a payment on this expense');
    });

    it('rejects source that is itself a refund (sourcePaymentId is set)', async () => {
      setupRefundTx({ sourceOverrides: { sourcePaymentId: 'prev-pay' } });
      await expect(service.refund('exp-1', validDto, 'user-1', 'admin'))
        .rejects.toThrow('Refund source must be a payment on this expense');
    });

    it('rejects source with non-positive amount', async () => {
      setupRefundTx({ sourceOverrides: { amount: '-500.0000' } });
      await expect(service.refund('exp-1', validDto, 'user-1', 'admin'))
        .rejects.toThrow('Refund source must be a payment on this expense');
    });

    it('rejects batch grouped by source that exceeds source - prior refunds', async () => {
      setupRefundTx({ priorRefunds: [{ id: 'r0', expenseId: 'exp-1', amount: '-800.0000', sourcePaymentId: 'p1' }] });
      await expect(service.refund('exp-1', validDto, 'user-1', 'admin'))
        .rejects.toThrow('Refund total exceeds the refundable amount for source payment p1');
    });

    it('rejects two refund lines for same source that individually fit but collectively exceed', async () => {
      setupRefundTx();
      await expect(service.refund('exp-1', {
        refunds: [
          { sourcePaymentId: 'p1', amount: '600.0000', refundDate: '2026-07-25' },
          { sourcePaymentId: 'p1', amount: '500.0000', refundDate: '2026-07-26' },
        ],
      }, 'user-1', 'admin'))
        .rejects.toThrow('Refund total exceeds the refundable amount for source payment p1');
    });

    it('happy path: persists negative row, inherits method, posts JE, recomputes aggregates', async () => {
      setupRefundTx();
      expenseService.findOne.mockResolvedValue({ id: 'exp-1', expenseNumber: 'EXP-26-001', payments: [] } as any);

      const result = await service.refund('exp-1', validDto, 'user-1', 'admin');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      expect(txExpenseRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }));

      expect(txPayRepo.save).toHaveBeenCalledTimes(1);
      expect(txPayRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        expenseId: 'exp-1',
        paymentMethodId: 'pm-1',
        amount: '-300.0000',
        paymentDate: '2026-07-25',
        reference: 'REF-R1',
        sourcePaymentId: 'p1',
      }));

      expect(posting.postExpenseRefund).toHaveBeenCalledTimes(1);
      expect(posting.postExpenseRefund).toHaveBeenCalledWith({
        expenseId: 'exp-1', refundRowId: 'pay-1', expenseAccountId: 'acc-1',
        channel: 'CASH', amount: '300.0000', sourceRef: 'EXP-26-001',
        entryDate: '2026-07-25', createdBy: 'admin',
      }, txManager);

      expect(txExpenseRepo.update).toHaveBeenCalledWith('exp-1', expect.objectContaining({
        paidAmount: '700.0000', balance: '800.0000', paymentStatus: ExpensePaymentStatus.PARTIAL,
      }));

      expect(auditLogService.log).toHaveBeenCalledWith(
        'REFUND', 'Expense', expect.stringContaining('EXP-26-001'),
        expect.objectContaining({ entityId: 'exp-1', userId: 'user-1', username: 'admin' }),
      );

      expect(expenseService.findOne).toHaveBeenCalledWith('exp-1');
      expect(result).toBeDefined();
    });

    it('sets paymentStatus UNPAID when fully refunded', async () => {
      setupRefundTx();
      expenseService.findOne.mockResolvedValue({ id: 'exp-1' } as any);

      await service.refund('exp-1', {
        refunds: [{ sourcePaymentId: 'p1', amount: '1000.0000', refundDate: '2026-07-25' }],
      }, 'user-1', 'admin');

      expect(txExpenseRepo.update).toHaveBeenCalledWith('exp-1', {
        paidAmount: '0.0000', balance: '1500.0000', paymentStatus: ExpensePaymentStatus.UNPAID,
      });
    });

    it('loads source method with withDeleted: true', async () => {
      setupRefundTx();
      expenseService.findOne.mockResolvedValue({ id: 'exp-1' } as any);

      txPmRepo.findOne = jest.fn().mockImplementation((opts: any) => {
        if (opts.withDeleted === true && opts.where.id === 'pm-1') {
          return Promise.resolve(cashMethod());
        }
        return Promise.resolve(null);
      });

      await service.refund('exp-1', validDto, 'user-1', 'admin');

      expect(txPmRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'pm-1' },
        withDeleted: true,
      }));
    });

    it('uses system as default userId when not provided', async () => {
      setupRefundTx();
      expenseService.findOne.mockResolvedValue({ id: 'exp-1' } as any);

      await service.refund('exp-1', validDto);

      expect(auditLogService.log).toHaveBeenCalledWith(
        'REFUND', 'Expense', expect.any(String),
        expect.objectContaining({ userId: 'system', username: undefined }),
      );
    });
  });
});
