import { jest } from '@jest/globals';
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { AuditLogService } from '../../audit-logs/services';
import {
  PaymentMethodEntity,
  PurchaseOrder,
  VendorPayment,
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
} from '../../../database/entities';
import { CreateVendorPaymentDto } from '../dto';
import { VENDOR_PAYMENT_VOIDED } from '../vendor-payment-status';
import { VendorPaymentService } from './vendor-payment.service';

describe('VendorPaymentService', () => {
  let service: VendorPaymentService;
  let vendorPaymentRepository: any;
  let purchaseOrderRepository: any;
  let paymentMethodRepository: any;
  let auditLogService: any;

  const mockSupplier = {
    id: 'supplier-123',
    companyName: 'Test Supplier Inc.',
  };

  const mockPurchaseOrder = {
    id: 'po-123',
    orderNumber: 'PO-000001',
    supplierId: 'supplier-123',
    totalAmount: '1000.0000',
    paidAmount: '0.0000',
    status: PurchaseOrderStatus.DRAFT,
    paymentStatus: PurchaseOrderPaymentStatus.UNPAID,
  } as Partial<PurchaseOrder>;

  const mockVendorPayment = {
    id: 'payment-123',
    supplierId: 'supplier-123',
    purchaseOrderId: 'po-123',
    amount: '1000.0000',
    paymentDate: new Date('2024-01-15'),
    paymentMethodId: 'pm-bank-id',
    status: 'completed',
  } as Partial<VendorPayment>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorPaymentService,
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
            find: (jest.fn as unknown as any)(),
            create: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            softDelete: (jest.fn as unknown as any)(),
            restore: (jest.fn as unknown as any)(),
            remove: (jest.fn as unknown as any)(),
            createQueryBuilder: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
            update: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: (jest.fn as unknown as any)(),
          },
        },
      ],
    }).compile();

    service = module.get<VendorPaymentService>(VendorPaymentService);
    vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    auditLogService = module.get(AuditLogService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto: CreateVendorPaymentDto = {
      supplierId: 'supplier-123',
      purchaseOrderId: 'po-123',
      amount: '1000.0000',
      paymentDate: '2024-01-15',
      paymentMethodId: 'pm-bank-id',
      status: 'completed',
    };

    beforeEach(() => {
      paymentMethodRepository.findOne.mockResolvedValue({
        id: 'pm-bank-id',
      } as PaymentMethodEntity);
      vendorPaymentRepository.create.mockReturnValue(mockVendorPayment as VendorPayment);
      vendorPaymentRepository.save.mockResolvedValue(mockVendorPayment as VendorPayment);
      purchaseOrderRepository.update.mockResolvedValue({} as any);
      auditLogService.log.mockResolvedValue(undefined);

      vendorPaymentRepository.findOne.mockResolvedValueOnce({
        ...mockVendorPayment,
        supplier: mockSupplier,
      } as VendorPayment);
    });

    it('does not generate a document number when creating a payment', async () => {
      await service.create(createDto);
      expect(vendorPaymentRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ paymentNumber: expect.anything() }),
      );
    });

    it('persists purchaseOrderId and posts accounting entry', async () => {
      await service.create(createDto, 'test-user');

      expect(vendorPaymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseOrderId: 'po-123',
          supplierId: 'supplier-123',
          paymentMethodId: 'pm-bank-id',
        }),
      );
      expect(purchaseOrderRepository.update).toHaveBeenCalledWith('po-123', {});
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'VendorPayment',
        `Created vendor payment ${mockVendorPayment.id}`,
        expect.objectContaining({
          entityId: mockVendorPayment.id,
          userId: 'test-user',
        }),
      );
    });

    it('still logs through the injected AuditLogService after dropping the base class', async () => {
      const dto = { ...createDto, referenceNumber: 'WIRE-001' };

      vendorPaymentRepository.create.mockReturnValue({ ...dto } as any);
      vendorPaymentRepository.save.mockResolvedValue({
        id: 'payment-123',
        ...dto,
      } as any);

      await service.create(dto, 'user-1', 'tester');

      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'VendorPayment',
        expect.any(String),
        expect.objectContaining({
          newValues: expect.objectContaining({ referenceNumber: 'WIRE-001' }),
        }),
      );
    });

    it('persists the exact amount string given on the saved entity', async () => {
      const dto = { ...createDto, amount: '1000.0000' };
      vendorPaymentRepository.create.mockReturnValue({ ...dto } as any);
      vendorPaymentRepository.save.mockResolvedValue({
        id: 'payment-123',
        ...dto,
      } as any);

      const result = await service.create(dto, 'user-1', 'tester');

      expect(vendorPaymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '1000.0000' }),
      );
      expect(result.amount).toBe('1000.0000');
    });

    it('normalizes a shorter amount string to scale 4 on the created entity', async () => {
      const dto = { ...createDto, amount: '1000' };
      vendorPaymentRepository.create.mockImplementation((row: any) => ({ ...row }) as any);
      vendorPaymentRepository.save.mockImplementation(
        async (row: any) => ({ id: 'payment-123', ...row }) as any,
      );

      const result = await service.create(dto, 'user-1', 'tester');

      expect(vendorPaymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '1000.0000' }),
      );
      expect(result.amount).toBe('1000.0000');
    });

    it('logs the normalized amount string in the audit trail', async () => {
      const dto = { ...createDto, amount: '1000' };
      vendorPaymentRepository.create.mockImplementation((row: any) => ({ ...row }) as any);
      vendorPaymentRepository.save.mockImplementation(
        async (row: any) => ({ id: 'payment-123', ...row }) as any,
      );

      await service.create(dto, 'user-1', 'tester');

      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'VendorPayment',
        expect.any(String),
        expect.objectContaining({
          newValues: expect.objectContaining({ amount: '1000.0000' }),
        }),
      );
    });
  });

  describe('findAllByPurchaseOrder manager binding', () => {
    it('uses the injected repository when no manager is passed', async () => {
      vendorPaymentRepository.find.mockResolvedValue([]);

      await service.findAllByPurchaseOrder('po-1');

      expect(vendorPaymentRepository.find).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-1', status: Not(VENDOR_PAYMENT_VOIDED) },
      });
    });

    it('uses the manager repository when a manager is passed', async () => {
      const managerRepo = { find: (jest.fn as unknown as any)().mockResolvedValue([]) };
      const manager = { getRepository: (jest.fn as unknown as any)().mockReturnValue(managerRepo) } as any;

      await service.findAllByPurchaseOrder('po-1', manager);

      expect(manager.getRepository).toHaveBeenCalledWith(VendorPayment);
      expect(managerRepo.find).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-1', status: Not(VENDOR_PAYMENT_VOIDED) },
      });
    });
  });

  describe('voidForUnpay', () => {
    const voidedAt = new Date('2026-10-17T10:00:00.000Z');

    function managerWithUpdate(affected: number) {
      const managerRepo = {
        update: (jest.fn as unknown as any)().mockResolvedValue({ affected }),
      };
      const manager = {
        getRepository: (jest.fn as unknown as any)().mockReturnValue(managerRepo),
      } as any;
      return { manager, managerRepo };
    }

    it('voids the row with a column-scoped update guarded on the live status', async () => {
      const payment = { id: 'vp-1', status: 'completed' } as VendorPayment;
      const { manager, managerRepo } = managerWithUpdate(1);

      await service.voidForUnpay(
        payment,
        { voidedByUserId: 'user-1', voidedAt, reversalEntryId: 'rev-1' },
        manager,
      );

      expect(manager.getRepository).toHaveBeenCalledWith(VendorPayment);
      expect(managerRepo.update).toHaveBeenCalledWith(
        { id: 'vp-1', status: Not(VENDOR_PAYMENT_VOIDED) },
        {
          status: VENDOR_PAYMENT_VOIDED,
          isActive: false,
          voidedAt,
          voidedByUserId: 'user-1',
          voidReversalEntryId: 'rev-1',
        },
      );
    });

    it('records a null reversal link when the payment never posted', async () => {
      const payment = { id: 'vp-1', status: 'completed' } as VendorPayment;
      const { manager, managerRepo } = managerWithUpdate(1);

      await service.voidForUnpay(
        payment,
        { voidedByUserId: 'user-1', voidedAt, reversalEntryId: null },
        manager,
      );

      expect(managerRepo.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ voidReversalEntryId: null }),
      );
    });

    it('rejects when the guarded update affects no row', async () => {
      const payment = { id: 'vp-1', status: 'completed' } as VendorPayment;
      const { manager } = managerWithUpdate(0);

      await expect(
        service.voidForUnpay(
          payment,
          { voidedByUserId: 'user-1', voidedAt, reversalEntryId: 'rev-1' },
          manager,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('returns a payment with its relations without filtering on isActive', async () => {
      const payment = { id: 'payment-123', isActive: true } as VendorPayment;
      vendorPaymentRepository.findOne.mockResolvedValue(payment);

      await expect(service.findOne('payment-123')).resolves.toBe(payment);

      expect(vendorPaymentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'payment-123' },
        relations: {
          supplier: true,
          purchaseOrder: { items: { product: true } },
          paymentMethodEntity: true,
        },
      });
    });

    it('throws NotFoundException when the payment does not exist', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
