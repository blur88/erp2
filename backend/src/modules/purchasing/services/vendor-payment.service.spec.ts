import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLogService } from '../../audit-logs/services';
import {
  PaymentMethodEntity,
  PurchaseOrder,
  VendorPayment,
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
} from '../../../database/entities';
import { CreateVendorPaymentDto } from '../dto';
import { VendorPaymentService } from './vendor-payment.service';

describe('VendorPaymentService', () => {
  let service: VendorPaymentService;
  let vendorPaymentRepository: jest.Mocked<Repository<VendorPayment>>;
  let purchaseOrderRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockSupplier = {
    id: 'supplier-123',
    companyName: 'Test Supplier Inc.',
  };

  const mockPurchaseOrder = {
    id: 'po-123',
    orderNumber: 'PO-000001',
    supplierId: 'supplier-123',
    totalAmount: 1000,
    paidAmount: 0,
    status: PurchaseOrderStatus.DRAFT,
    paymentStatus: PurchaseOrderPaymentStatus.UNPAID,
  } as Partial<PurchaseOrder>;

  const mockVendorPayment = {
    id: 'payment-123',
    supplierId: 'supplier-123',
    purchaseOrderId: 'po-123',
    amount: 1000,
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
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VendorPaymentService>(VendorPaymentService);
    vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    auditLogService = module.get(AuditLogService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto: CreateVendorPaymentDto = {
      supplierId: 'supplier-123',
      purchaseOrderId: 'po-123',
      amount: 1000,
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
  });

  describe('createForPurchaseOrder', () => {
    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrder,
        supplier: mockSupplier,
      } as PurchaseOrder);
      paymentMethodRepository.findOne.mockResolvedValue({
        id: 'pm-bank-id',
      } as PaymentMethodEntity);
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentRepository.create.mockReturnValue(mockVendorPayment as VendorPayment);
      vendorPaymentRepository.save.mockResolvedValue(mockVendorPayment as VendorPayment);
      purchaseOrderRepository.save.mockResolvedValue({
        ...mockPurchaseOrder,
        paidAmount: 1000,
        paymentStatus: PurchaseOrderPaymentStatus.PAID,
        status: PurchaseOrderStatus.READY,
      } as PurchaseOrder);
      auditLogService.log.mockResolvedValue(undefined);
    });

    it('updates purchase order totals when paying in full', async () => {
      await service.createForPurchaseOrder('po-123', 'test-user');

      expect(purchaseOrderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'po-123',
          paidAmount: 1000,
          paymentStatus: PurchaseOrderPaymentStatus.PAID,
          status: PurchaseOrderStatus.READY,
        }),
      );
    });
  });

  describe('findAllByPurchaseOrder manager binding', () => {
    it('uses the injected repository when no manager is passed', async () => {
      vendorPaymentRepository.find.mockResolvedValue([]);

      await service.findAllByPurchaseOrder('po-1');

      expect(vendorPaymentRepository.find).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-1', isActive: true },
      });
    });

    it('uses the manager repository when a manager is passed', async () => {
      const managerRepo = { find: jest.fn().mockResolvedValue([]) };
      const manager = { getRepository: jest.fn().mockReturnValue(managerRepo) } as any;

      await service.findAllByPurchaseOrder('po-1', manager);

      expect(manager.getRepository).toHaveBeenCalledWith(VendorPayment);
      expect(managerRepo.find).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-1', isActive: true },
      });
    });
  });

  describe('softDeleteForUnpay', () => {
    it('sets isActive=false and soft-deletes the payment', async () => {
      const mockPayment = {
        id: 'vp-1',
        isActive: true,
      } as VendorPayment;

      vendorPaymentRepository.findOne.mockResolvedValue(mockPayment);
      vendorPaymentRepository.save.mockResolvedValue({ ...mockPayment, isActive: false } as VendorPayment);
      vendorPaymentRepository.softDelete.mockResolvedValue({} as any);

      await service.softDeleteForUnpay('vp-1');

      expect(vendorPaymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(vendorPaymentRepository.softDelete).toHaveBeenCalledWith('vp-1');
    });
  });
});
