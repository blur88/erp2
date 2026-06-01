import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JournalEntryService } from './journal-entry.service';
import { AccountMappingService } from './account-mapping.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { MappingType } from '../../../database/entities/account-mapping.entity';
import { FiscalPeriodStatus } from '../../../database/entities/fiscal-period.entity';
import { AuditLogService } from '../../audit-logs/services';

describe('AccountingService', () => {
  let service: AccountingService;
  let journalEntryService: jest.Mocked<JournalEntryService>;
  let accountMappingService: jest.Mocked<AccountMappingService>;
  let fiscalPeriodService: jest.Mocked<FiscalPeriodService>;

  const mockMappings: Record<string, string> = {
    [MappingType.SALES_REVENUE]: 'revenue-account-id',
    [MappingType.SALES_AR]: 'ar-account-id',
    [MappingType.SALES_COGS]: 'cogs-account-id',
    [MappingType.SALES_INVENTORY]: 'inventory-account-id',
    [MappingType.PURCHASE_INVENTORY]: 'purchase-inventory-id',
    [MappingType.PURCHASE_AP]: 'ap-account-id',
    [MappingType.PAYMENT_AR]: 'payment-ar-id',
    [MappingType.VENDOR_PAYMENT_AP]: 'vendor-ap-id',
    [MappingType.INVENTORY_ASSET]: 'inventory-asset-id',
    [MappingType.INVENTORY_ADJUSTMENT_GAIN]: 'adjustment-gain-id',
    [MappingType.INVENTORY_ADJUSTMENT_LOSS]: 'adjustment-loss-id',
    payment_cash: 'cash-account-id',
    vendor_payment_cash: 'vendor-cash-id',
  };

  const mockOpenPeriod = {
    id: 'period-123',
    code: '2026-01',
    name: 'January 2026',
    status: FiscalPeriodStatus.OPEN,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
  };

  const mockJournalEntry = {
    id: 'entry-123',
    referenceNumber: 'JE-2026-001',
    description: 'Test entry',
    entryDate: new Date('2026-01-15'),
    status: 'POSTED',
    lines: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingService,
        {
          provide: JournalEntryService,
          useValue: {
            create: jest.fn(),
            postEntry: jest.fn(),
            findBySource: jest.fn(),
            reverseEntryInPeriod: jest.fn(),
          },
        },
        {
          provide: AccountMappingService,
          useValue: {
            getMappings: jest.fn(),
          },
        },
        {
          provide: FiscalPeriodService,
          useValue: {
            validatePeriod: jest.fn(),
            getCurrentPeriod: jest.fn(),
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

    service = module.get<AccountingService>(AccountingService);
    journalEntryService = module.get(JournalEntryService) as jest.Mocked<JournalEntryService>;
    accountMappingService = module.get(AccountMappingService) as jest.Mocked<AccountMappingService>;
    fiscalPeriodService = module.get(FiscalPeriodService) as jest.Mocked<FiscalPeriodService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('postSalesOrderEntry', () => {
    const mockSalesOrder = {
      id: 'so-123',
      orderNumber: 'SO-001',
      totalAmount: 1500,
      shippingAmount: 0,
      fulfilledDate: new Date('2026-01-15'),
      customer: {
        id: 'customer-123',
        name: 'Test Customer',
      },
      items: [
        {
          id: 'item-1',
          quantity: 10,
          unitPrice: 100,
          totalAmount: 1000,
          product: {
            id: 'product-1',
            name: 'Product A',
            baseCost: 60,
          },
        },
        {
          id: 'item-2',
          quantity: 5,
          unitPrice: 100,
          totalAmount: 500,
          product: {
            id: 'product-2',
            name: 'Product B',
            baseCost: 80,
          },
        },
      ],
    } as any;

    beforeEach(() => {
      accountMappingService.getMappings.mockResolvedValue(mockMappings);
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        message: 'Period is open',
        period: mockOpenPeriod as any,
      });
      journalEntryService.findBySource.mockResolvedValue([]);
      journalEntryService.create.mockResolvedValue(mockJournalEntry as any);
      journalEntryService.postEntry.mockResolvedValue(mockJournalEntry as any);
    });

    it('accepts an optional EntityManager argument (4th param)', async () => {
      const manager = { getRepository: jest.fn() } as any;
      await expect(
        service.postSalesOrderEntry(mockSalesOrder, 'user-123', undefined, manager),
      ).resolves.toBeDefined();
    });

    it('should create two separate entries: COGS first, then Revenue', async () => {
      journalEntryService.create
        .mockResolvedValueOnce({ ...mockJournalEntry, id: 'cogs-entry' } as any)
        .mockResolvedValueOnce({ ...mockJournalEntry, id: 'revenue-entry' } as any);
      journalEntryService.postEntry
        .mockResolvedValueOnce({ ...mockJournalEntry, id: 'cogs-entry' } as any)
        .mockResolvedValueOnce({ ...mockJournalEntry, id: 'revenue-entry' } as any);

      const result = await service.postSalesOrderEntry(mockSalesOrder, 'user-123');

      // First create call = COGS entry
      expect(journalEntryService.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          description: 'Sales Order SO-001 - Test Customer (Cost of Goods Sold)',
          sourceType: 'sales_order',
          sourceId: 'so-123',
          fiscalPeriodId: 'period-123',
          lines: [
            expect.objectContaining({
              accountId: 'cogs-account-id',
              debitAmount: 1000,
              creditAmount: 0,
            }),
            expect.objectContaining({
              accountId: 'inventory-account-id',
              debitAmount: 0,
              creditAmount: 1000,
            }),
          ],
        }),
        'user-123',
      );

      // Second create call = Revenue entry
      expect(journalEntryService.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          description: 'Sales Order SO-001 - Test Customer (Revenue)',
          sourceType: 'sales_order',
          sourceId: 'so-123',
          fiscalPeriodId: 'period-123',
          lines: [
            expect.objectContaining({
              accountId: 'ar-account-id',
              debitAmount: 1500,
              creditAmount: 0,
            }),
            expect.objectContaining({
              accountId: 'revenue-account-id',
              debitAmount: 0,
              creditAmount: 1500,
            }),
          ],
        }),
        'user-123',
      );

      // Both entries posted
      expect(journalEntryService.postEntry).toHaveBeenCalledWith('cogs-entry', 'user-123');
      expect(journalEntryService.postEntry).toHaveBeenCalledWith('revenue-entry', 'user-123');

      // Returns the revenue entry
      expect(result).toEqual(expect.objectContaining({ id: 'revenue-entry' }));
    });

    it('should calculate COGS correctly', async () => {
      await service.postSalesOrderEntry(mockSalesOrder, 'user-123');

      // COGS entry is the first create call
      const cogsCreateCall = journalEntryService.create.mock.calls[0][0];
      const cogsLine = cogsCreateCall.lines.find((l: any) => l.accountId === 'cogs-account-id');

      expect(cogsLine.debitAmount).toBe(1000); // (10 * 60) + (5 * 80) = 600 + 400
    });

    it('should use items sum for AR/Revenue, not stale totalAmount column', async () => {
      const staleOrder = {
        id: 'so-stale',
        orderNumber: 'SO-STALE',
        totalAmount: 40,
        shippingAmount: 0,
        fulfilledDate: new Date('2026-01-15'),
        customer: { id: 'customer-123', name: 'Test Customer' },
        items: [
          {
            id: 'item-1',
            quantity: 1,
            unitPrice: 30,
            totalAmount: 30,
            product: { id: 'product-1', name: 'Product A', baseCost: 20 },
          },
        ],
      } as any;

      await service.postSalesOrderEntry(staleOrder, 'user-123');

      // Revenue entry is the second create call (cogs = 20 > 0, so COGS entry is first)
      const revenueCreateCall = journalEntryService.create.mock.calls[1][0];
      const arLine = revenueCreateCall.lines.find((l: any) => l.accountId === 'ar-account-id');
      const revenueLine = revenueCreateCall.lines.find(
        (l: any) => l.accountId === 'revenue-account-id',
      );

      expect(arLine.debitAmount).toBe(30);
      expect(revenueLine.creditAmount).toBe(30);
    });

    it('should throw BadRequestException when items relation is not loaded', async () => {
      const orderWithoutItems = {
        id: 'so-no-items',
        orderNumber: 'SO-NO-ITEMS',
        totalAmount: 100,
        shippingAmount: 0,
        fulfilledDate: new Date('2026-01-15'),
        customer: { id: 'customer-123', name: 'Test Customer' },
        items: undefined, // relation not loaded
      } as any;

      await expect(service.postSalesOrderEntry(orderWithoutItems, 'user-123')).rejects.toThrow(
        'Cannot post sales order entry for SO-NO-ITEMS: items relation not loaded',
      );
    });

    it('should throw when items not loaded even when shippingAmount is non-zero', async () => {
      // Regression: old warn condition (revenueAmount === 0) was bypassed when shipping > 0,
      // silently posting only shipping as revenue and missing all item revenue.
      const orderWithShippingNoItems = {
        id: 'so-shipping-only',
        orderNumber: 'SO-SHIP',
        totalAmount: 110,
        shippingAmount: 10,
        fulfilledDate: new Date('2026-01-15'),
        customer: { id: 'customer-123', name: 'Test Customer' },
        items: undefined,
      } as any;

      await expect(service.postSalesOrderEntry(orderWithShippingNoItems, 'user-123')).rejects.toThrow(
        'Cannot post sales order entry for SO-SHIP: items relation not loaded',
      );
    });

    it('should use correct account mappings', async () => {
      await service.postSalesOrderEntry(mockSalesOrder, 'user-123');

      expect(accountMappingService.getMappings).toHaveBeenCalled();

      const allLines = journalEntryService.create.mock.calls.flatMap(
        (call: any) => call[0].lines,
      );
      const accountIds = allLines.map((l: any) => l.accountId);

      expect(accountIds).toContain('cogs-account-id');
      expect(accountIds).toContain('inventory-account-id');
      expect(accountIds).toContain('ar-account-id');
      expect(accountIds).toContain('revenue-account-id');
    });

    it('creates only the Revenue entry when COGS is zero (service order)', async () => {
      const serviceOrder = {
        id: 'so-service',
        orderNumber: 'SO-SVC',
        totalAmount: 200,
        shippingAmount: 0,
        fulfilledDate: new Date('2026-01-15'),
        customer: { id: 'customer-123', name: 'Test Customer' },
        items: [
          {
            id: 'svc-1',
            quantity: 1,
            unitPrice: 200,
            totalAmount: 200,
            product: { id: 'svc-product', name: 'Consulting', baseCost: 0 },
          },
        ],
      } as any;

      await service.postSalesOrderEntry(serviceOrder, 'user-123');

      // Exactly one entry created: the Revenue entry; no COGS entry
      expect(journalEntryService.create).toHaveBeenCalledTimes(1);
      const createCall = journalEntryService.create.mock.calls[0][0];
      expect(createCall.description).toBe('Sales Order SO-SVC - Test Customer (Revenue)');
      const accountIds = createCall.lines.map((l: any) => l.accountId);
      expect(accountIds).toContain('ar-account-id');
      expect(accountIds).toContain('revenue-account-id');
      expect(accountIds).not.toContain('cogs-account-id');
    });

    it('posts COGS before Revenue and does not create Revenue if COGS post fails', async () => {
      journalEntryService.create.mockResolvedValue({
        ...mockJournalEntry,
        id: 'cogs-entry',
      } as any);
      journalEntryService.postEntry.mockRejectedValueOnce(new Error('infra failure'));

      await expect(service.postSalesOrderEntry(mockSalesOrder, 'user-123')).rejects.toThrow(
        'infra failure',
      );

      // COGS entry was created; Revenue entry was never created
      expect(journalEntryService.create).toHaveBeenCalledTimes(1);
      const onlyCreateCall = journalEntryService.create.mock.calls[0][0];
      expect(onlyCreateCall.description).toBe(
        'Sales Order SO-001 - Test Customer (Cost of Goods Sold)',
      );
    });

    it('should validate period is open', async () => {
      await service.postSalesOrderEntry(mockSalesOrder, 'user-123');

      expect(fiscalPeriodService.validatePeriod).toHaveBeenCalledWith({
        date: mockSalesOrder.fulfilledDate,
      });
    });

    it('should throw error when period is closed', async () => {
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: false,
        message: 'Period is closed',
      });

      await expect(
        service.postSalesOrderEntry(mockSalesOrder, 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when period not found', async () => {
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: false,
        message: 'No period found',
      });

      await expect(
        service.postSalesOrderEntry(mockSalesOrder, 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when mapping not configured', async () => {
      const incompleteMappings = { ...mockMappings };
      delete incompleteMappings[MappingType.SALES_REVENUE];
      accountMappingService.getMappings.mockResolvedValue(incompleteMappings);

      await expect(
        service.postSalesOrderEntry(mockSalesOrder, 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('postCustomerPaymentEntry', () => {
    const mockPayment = {
      id: 'payment-123',
      paymentNumber: 'PAY-001',
      amount: 1000,
      paymentDate: new Date('2026-01-15'),
      customer: {
        id: 'customer-123',
        name: 'Test Customer',
      },
      paymentMethodEntity: {
        code: 'CASH',
      },
    } as any;

    beforeEach(() => {
      accountMappingService.getMappings.mockResolvedValue(mockMappings);
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        message: 'Period is open',
        period: mockOpenPeriod as any,
      });
      journalEntryService.create.mockResolvedValue(mockJournalEntry as any);
      journalEntryService.postEntry.mockResolvedValue(mockJournalEntry as any);
    });

    it('should create journal entry with correct lines', async () => {
      const result = await service.postCustomerPaymentEntry(mockPayment, 'user-123');

      expect(journalEntryService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entryDate: mockPayment.paymentDate,
          description: `Payment PAY-001 from Test Customer`,
          sourceType: 'payment',
          sourceId: 'payment-123',
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'cash-account-id',
              debitAmount: 1000,
              creditAmount: 0,
            }),
            expect.objectContaining({
              accountId: 'payment-ar-id',
              debitAmount: 0,
              creditAmount: 1000,
            }),
          ]),
        }),
        'user-123',
      );

      expect(result).toEqual(mockJournalEntry);
    });

    it('should use correct account mappings', async () => {
      await service.postCustomerPaymentEntry(mockPayment, 'user-123');

      const createCall = journalEntryService.create.mock.calls[0][0];
      const accountIds = createCall.lines.map((l: any) => l.accountId);

      expect(accountIds).toContain('cash-account-id');
      expect(accountIds).toContain('payment-ar-id');
    });

    it('should validate period is open', async () => {
      await service.postCustomerPaymentEntry(mockPayment, 'user-123');

      expect(fiscalPeriodService.validatePeriod).toHaveBeenCalledWith({
        date: mockPayment.paymentDate,
      });
    });
  });

  describe('postGoodsReceivedEntry', () => {
    const mockGRN = {
      id: 'grn-123',
      grnNumber: 'GRN-001',
      receivedDate: new Date('2026-01-15'),
      supplier: {
        id: 'supplier-123',
        companyName: 'Test Supplier',
      },
      items: [
        {
          id: 'item-1',
          receivedQuantity: 10,
          purchaseOrderItem: {
            unitCost: 60,
          },
        },
        {
          id: 'item-2',
          receivedQuantity: 5,
          purchaseOrderItem: {
            unitCost: 80,
          },
        },
      ],
    } as any;

    beforeEach(() => {
      accountMappingService.getMappings.mockResolvedValue(mockMappings);
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        message: 'Period is open',
        period: mockOpenPeriod as any,
      });
      journalEntryService.create.mockResolvedValue(mockJournalEntry as any);
      journalEntryService.postEntry.mockResolvedValue(mockJournalEntry as any);
    });

    it('should create journal entry with correct lines', async () => {
      const result = await service.postGoodsReceivedEntry(mockGRN, 'user-123');

      expect(journalEntryService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entryDate: mockGRN.receivedDate,
          description: `GRN GRN-001 from Test Supplier`,
          sourceType: 'goods_received_note',
          sourceId: 'grn-123',
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'purchase-inventory-id',
              debitAmount: 1000, // (10 * 60) + (5 * 80)
              creditAmount: 0,
            }),
            expect.objectContaining({
              accountId: 'ap-account-id',
              debitAmount: 0,
              creditAmount: 1000,
            }),
          ]),
        }),
        'user-123',
      );

      expect(result).toEqual(mockJournalEntry);
    });

    it('should calculate total correctly from GRN items', async () => {
      await service.postGoodsReceivedEntry(mockGRN, 'user-123');

      const createCall = journalEntryService.create.mock.calls[0][0];
      const inventoryLine = createCall.lines.find((l: any) => l.accountId === 'purchase-inventory-id');

      expect(inventoryLine.debitAmount).toBe(1000); // (10 * 60) + (5 * 80)
    });

    it('should use correct account mappings', async () => {
      await service.postGoodsReceivedEntry(mockGRN, 'user-123');

      const createCall = journalEntryService.create.mock.calls[0][0];
      const accountIds = createCall.lines.map((l: any) => l.accountId);

      expect(accountIds).toContain('purchase-inventory-id');
      expect(accountIds).toContain('ap-account-id');
    });
  });

  describe('postVendorPaymentEntry', () => {
    const mockVendorPayment = {
      id: 'vp-123',
      paymentNumber: 'VP-001',
      amount: 1000,
      paymentDate: new Date('2026-01-15'),
      supplier: {
        id: 'supplier-123',
        companyName: 'Test Supplier',
      },
      paymentMethodEntity: {
        code: 'CASH',
      },
    } as any;

    beforeEach(() => {
      accountMappingService.getMappings.mockResolvedValue(mockMappings);
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        message: 'Period is open',
        period: mockOpenPeriod as any,
      });
      journalEntryService.create.mockResolvedValue(mockJournalEntry as any);
      journalEntryService.postEntry.mockResolvedValue(mockJournalEntry as any);
    });

    it('should create journal entry with correct lines', async () => {
      const result = await service.postVendorPaymentEntry(mockVendorPayment, 'user-123');

      expect(journalEntryService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entryDate: mockVendorPayment.paymentDate,
          description: `Vendor Payment VP-001 to Test Supplier`,
          sourceType: 'vendor_payment',
          sourceId: 'vp-123',
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'vendor-ap-id',
              debitAmount: 1000,
              creditAmount: 0,
            }),
            expect.objectContaining({
              accountId: 'vendor-cash-id',
              debitAmount: 0,
              creditAmount: 1000,
            }),
          ]),
        }),
        'user-123',
      );

      expect(result).toEqual(mockJournalEntry);
    });

    it('should use correct account mappings', async () => {
      await service.postVendorPaymentEntry(mockVendorPayment, 'user-123');

      const createCall = journalEntryService.create.mock.calls[0][0];
      const accountIds = createCall.lines.map((l: any) => l.accountId);

      expect(accountIds).toContain('vendor-ap-id');
      expect(accountIds).toContain('vendor-cash-id');
    });
  });

  describe('postStockAdjustmentEntry', () => {
    const mockAdjustmentIncrease = {
      id: 'adj-123',
      adjustmentNumber: 'ADJ-001',
      adjustmentDate: new Date('2026-01-15'),
      items: [
        {
          id: 'item-1',
          oldQuantity: 100,
          newQuantity: 120,
          unitCost: 50,
        },
        {
          id: 'item-2',
          oldQuantity: 50,
          newQuantity: 60,
          unitCost: 80,
        },
      ],
    } as any;

    const mockAdjustmentDecrease = {
      id: 'adj-124',
      adjustmentNumber: 'ADJ-002',
      adjustmentDate: new Date('2026-01-15'),
      items: [
        {
          id: 'item-1',
          oldQuantity: 100,
          newQuantity: 80,
          unitCost: 50,
        },
      ],
    } as any;

    const mockAdjustmentMixed = {
      id: 'adj-125',
      adjustmentNumber: 'ADJ-003',
      adjustmentDate: new Date('2026-01-15'),
      items: [
        {
          id: 'item-1',
          oldQuantity: 100,
          newQuantity: 120, // +20 * 50 = 1000 increase
          unitCost: 50,
        },
        {
          id: 'item-2',
          oldQuantity: 50,
          newQuantity: 30, // -20 * 80 = 1600 decrease
          unitCost: 80,
        },
      ],
    } as any;

    beforeEach(() => {
      accountMappingService.getMappings.mockResolvedValue(mockMappings);
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        message: 'Period is open',
        period: mockOpenPeriod as any,
      });
      journalEntryService.create.mockResolvedValue(mockJournalEntry as any);
      journalEntryService.postEntry.mockResolvedValue(mockJournalEntry as any);
    });

    it('should create entry for increase adjustments', async () => {
      const result = await service.postStockAdjustmentEntry(mockAdjustmentIncrease, 'user-123');

      expect(journalEntryService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entryDate: mockAdjustmentIncrease.adjustmentDate,
          description: `Stock Adjustment ADJ-001`,
          sourceType: 'stock_adjustment',
          sourceId: 'adj-123',
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'inventory-asset-id',
              debitAmount: 1800, // (20 * 50) + (10 * 80)
              creditAmount: 0,
            }),
            expect.objectContaining({
              accountId: 'adjustment-gain-id',
              debitAmount: 0,
              creditAmount: 1800,
            }),
          ]),
        }),
        'user-123',
      );

      expect(result).toEqual(mockJournalEntry);
    });

    it('should create entry for decrease adjustments', async () => {
      const result = await service.postStockAdjustmentEntry(mockAdjustmentDecrease, 'user-123');

      expect(journalEntryService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'adjustment-loss-id',
              debitAmount: 1000, // 20 * 50
              creditAmount: 0,
            }),
            expect.objectContaining({
              accountId: 'inventory-asset-id',
              debitAmount: 0,
              creditAmount: 1000,
            }),
          ]),
        }),
        'user-123',
      );

      expect(result).toEqual(mockJournalEntry);
    });

    it('should handle mixed increase/decrease adjustments', async () => {
      const result = await service.postStockAdjustmentEntry(mockAdjustmentMixed, 'user-123');

      const createCall = journalEntryService.create.mock.calls[0][0];

      // Should have 4 lines: increase DR/CR and decrease DR/CR
      expect(createCall.lines).toHaveLength(4);

      // Check increase lines
      const increaseDebitLine = createCall.lines.find(
        (l: any) => l.accountId === 'inventory-asset-id' && l.debitAmount > 0,
      );
      const increaseCreditLine = createCall.lines.find(
        (l: any) => l.accountId === 'adjustment-gain-id',
      );

      expect(increaseDebitLine.debitAmount).toBe(1000); // 20 * 50
      expect(increaseCreditLine.creditAmount).toBe(1000);

      // Check decrease lines
      const decreaseDebitLine = createCall.lines.find(
        (l: any) => l.accountId === 'adjustment-loss-id',
      );
      const decreaseCreditLine = createCall.lines.find(
        (l: any) => l.accountId === 'inventory-asset-id' && l.creditAmount > 0,
      );

      expect(decreaseDebitLine.debitAmount).toBe(1600); // 20 * 80
      expect(decreaseCreditLine.creditAmount).toBe(1600);

      expect(result).toEqual(mockJournalEntry);
    });

    it('should calculate totals correctly', async () => {
      await service.postStockAdjustmentEntry(mockAdjustmentIncrease, 'user-123');

      const createCall = journalEntryService.create.mock.calls[0][0];
      const inventoryLine = createCall.lines.find(
        (l: any) => l.accountId === 'inventory-asset-id' && l.debitAmount > 0,
      );

      expect(inventoryLine.debitAmount).toBe(1800); // (20 * 50) + (10 * 80)
    });
  });

  describe('postOpeningBalances', () => {
    it('should create a balanced journal entry with opening balances', async () => {
      const dto = {
        asOfDate: '2026-01-01',
        balances: [
          { accountId: 'cash-id', amount: 50000 },
          { accountId: 'ar-id', amount: 25000 },
          { accountId: 'ap-id', amount: -15000 },
          { accountId: 'equity-id', amount: -60000 },
        ],
        equityAccountId: 'equity-id',
      };

      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        message: 'Period is open',
        period: mockOpenPeriod as any,
      });
      journalEntryService.create.mockResolvedValue({ id: 'je-id' } as any);
      journalEntryService.postEntry.mockResolvedValue({
        id: 'je-id',
        status: 'POSTED',
      } as any);

      const result = await service.postOpeningBalances(dto);

      expect(journalEntryService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('Opening Balance'),
          sourceType: 'opening_balance',
        }),
        undefined,
        undefined,
      );
      expect(journalEntryService.postEntry).toHaveBeenCalledWith('je-id', undefined, undefined);
      expect(result).toEqual({ id: 'je-id', status: 'POSTED' });
    });

    it('should reject if no open fiscal period exists for the date', async () => {
      const dto = {
        asOfDate: '2025-01-01',
        balances: [{ accountId: 'cash-id', amount: 50000 }],
        equityAccountId: 'equity-id',
      };

      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: false,
        period: null,
      } as any);

      await expect(service.postOpeningBalances(dto)).rejects.toThrow(BadRequestException);
    });

    it('should reject when all balances are zero', async () => {
      const dto = {
        asOfDate: '2026-01-01',
        balances: [{ accountId: 'cash-id', amount: 0 }],
        equityAccountId: 'equity-id',
      };

      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        message: 'Period is open',
        period: mockOpenPeriod as any,
      });

      await expect(service.postOpeningBalances(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Helper Methods', () => {
    describe('calculateCOGS', () => {
      it('should calculate COGS correctly', () => {
        const items = [
          { quantity: 10, product: { baseCost: 60 } },
          { quantity: 5, product: { baseCost: 80 } },
        ] as any;

        const result = (service as any).calculateCOGS(items);
        expect(result).toBe(1000); // (10 * 60) + (5 * 80)
      });

      it('should handle missing baseCost', () => {
        const items = [
          { quantity: 10, product: { baseCost: 60 } },
          { quantity: 5, product: {} },
        ] as any;

        const result = (service as any).calculateCOGS(items);
        expect(result).toBe(600); // Only first item counted
      });
    });

    describe('calculateGRNTotal', () => {
      it('should calculate GRN total correctly', () => {
        const items = [
          { receivedQuantity: 10, purchaseOrderItem: { unitCost: 60 } },
          { receivedQuantity: 5, purchaseOrderItem: { unitCost: 80 } },
        ] as any;

        const result = (service as any).calculateGRNTotal(items);
        expect(result).toBe(1000); // (10 * 60) + (5 * 80)
      });

      it('should handle missing purchaseOrderItem', () => {
        const items = [
          { receivedQuantity: 10, purchaseOrderItem: { unitCost: 60 } },
          { receivedQuantity: 5 }, // No purchaseOrderItem
        ] as any;

        const result = (service as any).calculateGRNTotal(items);
        expect(result).toBe(600); // Only first item counted
      });
    });

    describe('calculateAdjustmentTotals', () => {
      it('should calculate increases correctly', () => {
        const items = [
          { oldQuantity: 100, newQuantity: 120, unitCost: 50 },
          { oldQuantity: 50, newQuantity: 60, unitCost: 80 },
        ] as any;

        const result = (service as any).calculateAdjustmentTotals(items);
        expect(result.totalIncrease).toBe(1800); // (20 * 50) + (10 * 80)
        expect(result.totalDecrease).toBe(0);
      });

      it('should calculate decreases correctly', () => {
        const items = [
          { oldQuantity: 120, newQuantity: 100, unitCost: 50 },
          { oldQuantity: 60, newQuantity: 50, unitCost: 80 },
        ] as any;

        const result = (service as any).calculateAdjustmentTotals(items);
        expect(result.totalIncrease).toBe(0);
        expect(result.totalDecrease).toBe(1800); // (20 * 50) + (10 * 80)
      });

      it('should calculate mixed adjustments correctly', () => {
        const items = [
          { oldQuantity: 100, newQuantity: 120, unitCost: 50 }, // +20 * 50 = 1000
          { oldQuantity: 50, newQuantity: 30, unitCost: 80 },   // -20 * 80 = 1600
        ] as any;

        const result = (service as any).calculateAdjustmentTotals(items);
        expect(result.totalIncrease).toBe(1000);
        expect(result.totalDecrease).toBe(1600);
      });

      it('should ignore zero differences', () => {
        const items = [
          { oldQuantity: 100, newQuantity: 100, unitCost: 50 }, // no change
          { oldQuantity: 50, newQuantity: 60, unitCost: 80 },   // +10 * 80 = 800
        ] as any;

        const result = (service as any).calculateAdjustmentTotals(items);
        expect(result.totalIncrease).toBe(800);
        expect(result.totalDecrease).toBe(0);
      });
    });
  });

  describe('validatePeriodOpen', () => {
    it('should allow posting to open period', async () => {
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        message: 'Period is open',
        period: mockOpenPeriod as any,
      });

      await expect(
        (service as any).validatePeriodOpen(new Date('2026-01-15')),
      ).resolves.not.toThrow();
    });

    it('should throw error for closed period', async () => {
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: false,
        message: 'Period is closed',
      });

      await expect(
        (service as any).validatePeriodOpen(new Date('2026-01-15')),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when period not found', async () => {
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: false,
        message: 'No fiscal period found',
      });

      await expect(
        (service as any).validatePeriodOpen(new Date('2026-01-15')),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reverseSourceEntries', () => {
    const openPeriod = {
      id: 'period-open-123',
      status: FiscalPeriodStatus.OPEN,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-28'),
    };

    const postedEntry = {
      id: 'je-123',
      status: 'POSTED',
      reversedById: null,
      sourceType: 'payment',
      sourceId: 'pay-123',
    };

    it('should reverse all posted entries matching sourceType and sourceId', async () => {
      journalEntryService.findBySource.mockResolvedValue([postedEntry as any]);
      fiscalPeriodService.getCurrentPeriod.mockResolvedValue(openPeriod as any);
      journalEntryService.reverseEntryInPeriod.mockResolvedValue({} as any);

      await service.reverseSourceEntries('payment', 'pay-123', 'system');

      expect(journalEntryService.reverseEntryInPeriod).toHaveBeenCalledWith(
        'je-123',
        'period-open-123',
        'system',
      );
    });

    it('should throw BadRequestException if no open fiscal period', async () => {
      journalEntryService.findBySource.mockResolvedValue([postedEntry as any]);
      fiscalPeriodService.getCurrentPeriod.mockResolvedValue(null);

      await expect(
        service.reverseSourceEntries('payment', 'pay-123', 'system'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip entries that are already reversed', async () => {
      const alreadyReversed = { ...postedEntry, reversedById: 'je-456' };
      journalEntryService.findBySource.mockResolvedValue([alreadyReversed as any]);
      fiscalPeriodService.getCurrentPeriod.mockResolvedValue(openPeriod as any);
      journalEntryService.reverseEntryInPeriod.mockResolvedValue({} as any);

      await service.reverseSourceEntries('payment', 'pay-123', 'system');

      expect(journalEntryService.reverseEntryInPeriod).not.toHaveBeenCalled();
    });

    it('should skip entries that are not POSTED', async () => {
      const draftEntry = { ...postedEntry, status: 'DRAFT', reversedById: null };
      journalEntryService.findBySource.mockResolvedValue([draftEntry as any]);
      fiscalPeriodService.getCurrentPeriod.mockResolvedValue(openPeriod as any);
      journalEntryService.reverseEntryInPeriod.mockResolvedValue({} as any);

      await service.reverseSourceEntries('payment', 'pay-123', 'system');

      expect(journalEntryService.reverseEntryInPeriod).not.toHaveBeenCalled();
    });

    it('should do nothing if no entries found', async () => {
      journalEntryService.findBySource.mockResolvedValue([]);

      await service.reverseSourceEntries('payment', 'pay-123', 'system');

      expect(fiscalPeriodService.getCurrentPeriod).not.toHaveBeenCalled();
      expect(journalEntryService.reverseEntryInPeriod).not.toHaveBeenCalled();
    });
  });

  describe('reversePaymentEntry', () => {
    const openPeriod = {
      id: 'period-open-123',
      status: FiscalPeriodStatus.OPEN,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-28'),
    };

    it('should create a 2-line JE transferring between payment accounts', async () => {
      fiscalPeriodService.getCurrentPeriod.mockResolvedValue(openPeriod as any);
      accountMappingService.getMappings.mockResolvedValue({
        payment_cash: 'cash-account-id',
        payment_bank: 'bank-account-id',
        [MappingType.PAYMENT_AR]: 'ar-account-id',
      });
      journalEntryService.create.mockResolvedValue({ id: 'je-new' } as any);
      journalEntryService.postEntry.mockResolvedValue({ id: 'je-new', status: 'POSTED' } as any);

      await service.reversePaymentEntry('original-pay-id', 'CASH', 'BANK', 200, 'system');

      expect(journalEntryService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'cash-account-id',
              debitAmount: 200,
              creditAmount: 0,
            }),
            expect.objectContaining({
              accountId: 'bank-account-id',
              debitAmount: 0,
              creditAmount: 200,
            }),
          ]),
        }),
        'system',
      );
    });

    it('should throw if no open fiscal period', async () => {
      fiscalPeriodService.getCurrentPeriod.mockResolvedValue(null);

      await expect(
        service.reversePaymentEntry('pay-id', 'CASH', 'BANK', 100, 'system'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if original payment method account not mapped', async () => {
      fiscalPeriodService.getCurrentPeriod.mockResolvedValue(openPeriod as any);
      accountMappingService.getMappings.mockResolvedValue({
        payment_bank: 'bank-account-id',
      });

      await expect(
        service.reversePaymentEntry('pay-id', 'CASH', 'BANK', 100, 'system'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
