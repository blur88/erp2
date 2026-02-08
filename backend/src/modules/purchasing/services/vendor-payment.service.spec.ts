import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { VendorPaymentService } from './vendor-payment.service';
import {
  VendorPayment,
  PurchaseOrder,
  GoodsReceivedNote,
  Supplier,
} from '../../../database/entities';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { CreateVendorPaymentDto } from '../dto';

describe('VendorPaymentService', () => {
  let service: VendorPaymentService;
  let vendorPaymentRepository: jest.Mocked<Repository<VendorPayment>>;
  let purchaseOrderRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let grnRepository: jest.Mocked<Repository<GoodsReceivedNote>>;
  let accountingService: jest.Mocked<AccountingService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockSupplier: Partial<Supplier> = {
    id: 'supplier-123',
    companyName: 'Test Supplier Inc.',
  };

  const mockPurchaseOrder: Partial<PurchaseOrder> = {
    id: 'po-123',
    orderNumber: 'PO-000001',
    supplierId: 'supplier-123',
    totalAmount: 1000,
  };

  const mockGrn: Partial<GoodsReceivedNote> = {
    id: 'grn-123',
    grnNumber: 'GRN-000001',
    purchaseOrderId: 'po-123',
  };

  const mockVendorPayment: Partial<VendorPayment> = {
    id: 'payment-123',
    paymentNumber: 'VP-000001',
    supplierId: 'supplier-123',
    purchaseOrderId: 'po-123',
    grnId: 'grn-123',
    amount: 1000,
    paymentDate: new Date('2024-01-15'),
    paymentMethod: 'bank_transfer',
    status: 'completed',
  };

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
          },
        },
        {
          provide: getRepositoryToken(GoodsReceivedNote),
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
          provide: AccountingService,
          useValue: {
            postVendorPaymentEntry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VendorPaymentService>(VendorPaymentService);
    vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    grnRepository = module.get(getRepositoryToken(GoodsReceivedNote));
    accountingService = module.get(AccountingService);
    auditLogService = module.get(AuditLogService);

    // Suppress logger output during tests
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
      paymentMethod: 'bank_transfer',
      status: 'completed',
    };

    beforeEach(() => {
      // Mock the repository methods
      grnRepository.findOne.mockResolvedValue(mockGrn as GoodsReceivedNote);
      vendorPaymentRepository.create.mockReturnValue(mockVendorPayment as VendorPayment);
      vendorPaymentRepository.save.mockResolvedValue(mockVendorPayment as VendorPayment);
      purchaseOrderRepository.update.mockResolvedValue({} as any);
      auditLogService.log.mockResolvedValue(undefined);

      // Mock query builder for generatePaymentNumber
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null), // No previous payments
      };
      vendorPaymentRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
    });

    it('should post accounting entry successfully', async () => {
      // Mock findOne to return vendor payment with all relations for accounting
      const fullPayment = {
        ...mockVendorPayment,
        supplier: mockSupplier,
      } as VendorPayment;

      vendorPaymentRepository.findOne.mockResolvedValueOnce(fullPayment);
      accountingService.postVendorPaymentEntry.mockResolvedValue({} as any);

      await service.create(createDto, 'test-user');

      // Verify accounting service was called with correct parameters
      expect(accountingService.postVendorPaymentEntry).toHaveBeenCalledWith(
        fullPayment,
        'test-user',
      );

      // Verify it was called exactly once
      expect(accountingService.postVendorPaymentEntry).toHaveBeenCalledTimes(1);

      // Verify payment was still created successfully
      expect(vendorPaymentRepository.save).toHaveBeenCalled();
    });

    it('should continue when accounting post fails', async () => {
      // Mock findOne to return vendor payment with all relations for accounting
      const fullPayment = {
        ...mockVendorPayment,
        supplier: mockSupplier,
      } as VendorPayment;

      vendorPaymentRepository.findOne.mockResolvedValueOnce(fullPayment);

      // Mock accounting service to throw error
      const accountingError = new Error('Account mapping not configured');
      accountingService.postVendorPaymentEntry.mockRejectedValue(accountingError);

      // Should not throw error - payment creation should continue
      await expect(service.create(createDto, 'test-user')).resolves.toBeDefined();

      // Verify error was logged
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to post accounting entry'),
        expect.any(String),
      );

      // Verify payment was still created successfully
      expect(vendorPaymentRepository.save).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'VendorPayment',
        expect.stringContaining('Created vendor payment'),
        expect.any(Object),
      );
    });

    it('should load payment with relations before posting', async () => {
      // Mock findOne to return payment with all relations
      const fullPayment = {
        ...mockVendorPayment,
        supplier: mockSupplier,
        purchaseOrder: mockPurchaseOrder,
        grn: mockGrn,
      } as VendorPayment;

      vendorPaymentRepository.findOne.mockResolvedValueOnce(fullPayment);
      accountingService.postVendorPaymentEntry.mockResolvedValue({} as any);

      await service.create(createDto, 'test-user');

      // Verify findOne was called with payment ID (relations loaded internally)
      expect(vendorPaymentRepository.findOne).toHaveBeenCalled();

      // Verify the full payment with relations was passed to accounting service
      expect(accountingService.postVendorPaymentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockVendorPayment.id,
          supplier: mockSupplier,
        }),
        'test-user',
      );
    });

    it('should handle accounting post when payment not found after creation', async () => {
      // Mock findOne to throw NotFoundException (payment not found after creation)
      vendorPaymentRepository.findOne.mockRejectedValueOnce(new Error('Payment not found'));

      // Payment creation should still succeed despite accounting error
      const result = await service.create(createDto, 'test-user');

      // Verify payment was still returned
      expect(result).toEqual(mockVendorPayment);

      // Verify error was logged
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to post accounting entry'),
        expect.any(String),
      );

      // Verify accounting service was not called (because findOne failed)
      expect(accountingService.postVendorPaymentEntry).not.toHaveBeenCalled();
    });

    it('should create vendor payment with audit log and accounting entry', async () => {
      const fullPayment = {
        ...mockVendorPayment,
        supplier: mockSupplier,
      } as VendorPayment;

      vendorPaymentRepository.findOne.mockResolvedValueOnce(fullPayment);
      accountingService.postVendorPaymentEntry.mockResolvedValue({} as any);

      await service.create(createDto, 'test-user');

      // Verify payment was created
      expect(vendorPaymentRepository.create).toHaveBeenCalled();
      expect(vendorPaymentRepository.save).toHaveBeenCalled();

      // Verify purchase order was touched
      expect(purchaseOrderRepository.update).toHaveBeenCalledWith('po-123', {});

      // Verify audit log was created
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'VendorPayment',
        'Created vendor payment: VP-000001',
        expect.objectContaining({
          entityId: mockVendorPayment.id,
          userId: 'test-user',
        }),
      );

      // Verify accounting entry was posted
      expect(accountingService.postVendorPaymentEntry).toHaveBeenCalled();

      // Verify success log
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('Posted accounting entry for vendor payment'),
      );
    });

    it('should automatically link GRN if purchaseOrderId is provided', async () => {
      const fullPayment = {
        ...mockVendorPayment,
        supplier: mockSupplier,
      } as VendorPayment;

      vendorPaymentRepository.findOne.mockResolvedValueOnce(fullPayment);
      accountingService.postVendorPaymentEntry.mockResolvedValue({} as any);

      await service.create(createDto, 'test-user');

      // Verify GRN lookup was attempted
      expect(grnRepository.findOne).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-123' },
      });

      // Verify payment was created with GRN
      expect(vendorPaymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          grnId: mockGrn.id,
        }),
      );
    });

    it('should handle missing GRN gracefully', async () => {
      const fullPayment = {
        ...mockVendorPayment,
        grnId: undefined,
        supplier: mockSupplier,
      } as VendorPayment;

      grnRepository.findOne.mockResolvedValueOnce(null);
      vendorPaymentRepository.create.mockReturnValue({ ...mockVendorPayment, grnId: undefined } as VendorPayment);
      vendorPaymentRepository.save.mockResolvedValue({ ...mockVendorPayment, grnId: undefined } as VendorPayment);
      vendorPaymentRepository.findOne.mockResolvedValueOnce(fullPayment);
      accountingService.postVendorPaymentEntry.mockResolvedValue({} as any);

      await service.create(createDto, 'test-user');

      // Verify payment was created without GRN
      expect(vendorPaymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          grnId: undefined,
        }),
      );

      // Verify accounting entry was still posted
      expect(accountingService.postVendorPaymentEntry).toHaveBeenCalled();
    });
  });
});
