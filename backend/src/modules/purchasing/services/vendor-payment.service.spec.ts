import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLogService } from '../../audit-logs/services';
import { SettingsService } from '../../settings/settings.service';
import { UserRole } from '../../../database/entities/user.entity';
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
  let settingsService: jest.Mocked<SettingsService>;

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
    paymentNumber: 'VP-000001',
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
        {
          provide: SettingsService,
          useValue: {
            generateDocumentNumber: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VendorPaymentService>(VendorPaymentService);
    vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    auditLogService = module.get(AuditLogService);
    settingsService = module.get(SettingsService);

    settingsService.generateDocumentNumber.mockResolvedValue('VP-26-001');

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

    it('persists purchaseOrderId and posts accounting entry', async () => {
      await service.create(createDto, 'test-user');

      expect(vendorPaymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseOrderId: 'po-123',
          supplierId: 'supplier-123',
          paymentMethodId: 'pm-bank-id',
          paymentNumber: 'VP-26-001',
        }),
      );
      expect(purchaseOrderRepository.update).toHaveBeenCalledWith('po-123', {});
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'VendorPayment',
        'Created vendor payment: VP-000001',
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

  describe('searchGlobal', () => {
    const adminUser = { role: UserRole.ADMIN } as any;

    it('returns vendor payment search results', async () => {
      vendorPaymentRepository.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'vp-1',
            paymentNumber: 'VP-001',
            referenceNumber: 'REF-001',
          },
        ]),
      } as any);

      const results = await service.searchGlobal('VP-001', adminUser);

      expect(results[0]).toMatchObject({
        type: 'vendor_payment',
        id: 'vp-1',
        label: 'VP-001',
        description: 'REF-001',
        route: '/purchasing/vendor-payments/vp-1',
      });
    });
  });

  describe('softDeleteForUnpay', () => {
    it('sets isActive=false and soft-deletes the payment', async () => {
      const mockPayment = {
        id: 'vp-1',
        paymentNumber: 'VP-000001',
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
