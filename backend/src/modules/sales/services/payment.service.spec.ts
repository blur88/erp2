import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentService } from './payment.service';
import { Payment, PaymentStatus } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { NotFoundException } from '@nestjs/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: jest.Mocked<Repository<Payment>>;
  let customerRepository: jest.Mocked<Repository<Customer>>;
  let accountingService: jest.Mocked<AccountingService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const createMockPayment = (): Partial<Payment> => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    paymentNumber: 'PAY-000001',
    amount: 1000,
    paymentDate: new Date('2024-01-15'),
    status: PaymentStatus.COMPLETED,
    customerId: 'customer-1',
    customer: {
      id: 'customer-1',
      name: 'Test Customer',
    } as Customer,
  });

  const createMockCustomer = (): Partial<Customer> => ({
    id: 'customer-1',
    name: 'Test Customer',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: {},
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
            postCustomerPaymentEntry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepository = module.get(getRepositoryToken(Payment));
    customerRepository = module.get(getRepositoryToken(Customer));
    accountingService = module.get(AccountingService);
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should post accounting entry successfully', async () => {
      // Arrange
      const createDto = {
        customerId: 'customer-1',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      };
      const mockCustomer = createMockCustomer();
      const mockPayment = createMockPayment();

      customerRepository.findOne.mockResolvedValue(mockCustomer as Customer);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);

      // Mock findPaymentWithRelations (called twice - once for accounting, once for return)
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);

      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postCustomerPaymentEntry.mockResolvedValue({
        id: 'journal-1',
        referenceNumber: 'JE-000001',
      } as any);

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(accountingService.postCustomerPaymentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockPayment.id,
          paymentNumber: mockPayment.paymentNumber,
          customer: expect.objectContaining({
            id: 'customer-1',
            name: 'Test Customer',
          }),
        }),
        'system',
      );
      expect(result).toBeDefined();
      expect(paymentRepository.save).toHaveBeenCalled();
    });

    it('should continue when accounting post fails', async () => {
      // Arrange
      const createDto = {
        customerId: 'customer-1',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      };
      const mockCustomer = createMockCustomer();
      const mockPayment = createMockPayment();

      customerRepository.findOne.mockResolvedValue(mockCustomer as Customer);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);

      // Mock findPaymentWithRelations
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);

      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postCustomerPaymentEntry.mockRejectedValue(
        new Error('Account mappings not configured'),
      );

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(accountingService.postCustomerPaymentEntry).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(paymentRepository.save).toHaveBeenCalled();
      // Should not throw error despite accounting failure
    });

    it('should load payment with relations before posting', async () => {
      // Arrange
      const createDto = {
        customerId: 'customer-1',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      };
      const mockCustomer = createMockCustomer();
      const mockPayment = createMockPayment();

      customerRepository.findOne.mockResolvedValue(mockCustomer as Customer);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);

      // Mock findPaymentWithRelations
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);

      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postCustomerPaymentEntry.mockResolvedValue({
        id: 'journal-1',
      } as any);

      // Act
      await service.create(createDto);

      // Assert
      // Verify findOne was called to get payment with relations before accounting post
      expect(paymentRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockPayment.id },
        relations: ['customer', 'invoice', 'invoice.salesOrder', 'invoice.items', 'invoice.items.product'],
      });

      // Verify the accounting service received the payment with customer relation
      const callArg = accountingService.postCustomerPaymentEntry.mock.calls[0][0];
      expect(callArg).toHaveProperty('customer');
      expect(callArg.customer).toEqual(mockCustomer);
    });

    it('should throw error when customer not found', async () => {
      // Arrange
      const createDto = {
        customerId: 'non-existent-customer',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      };
      customerRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
