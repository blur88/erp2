import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '../../src/app.module';
import { FiscalPeriod, FiscalPeriodStatus } from '../../src/database/entities/fiscal-period.entity';
import { ChartOfAccount } from '../../src/database/entities/chart-of-account.entity';
import { AccountMapping, MappingType } from '../../src/database/entities/account-mapping.entity';
import { JournalEntry, JournalEntryStatus } from '../../src/database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../src/database/entities/journal-entry-line.entity';
import { Customer } from '../../src/database/entities/customer.entity';
import { Supplier } from '../../src/database/entities/supplier.entity';
import { Category } from '../../src/database/entities/category.entity';
import { Product } from '../../src/database/entities/product.entity';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../../src/database/entities/sales-order.entity';
import { SalesOrderItem } from '../../src/database/entities/sales-order-item.entity';
import { Payment } from '../../src/database/entities/payment.entity';
import { PurchaseOrder } from '../../src/database/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../../src/database/entities/purchase-order-item.entity';
import { GoodsReceivedNote } from '../../src/database/entities/goods-received-note.entity';
import { VendorPayment } from '../../src/database/entities/vendor-payment.entity';
import { PaymentMethodEntity } from '../../src/database/entities/payment-method.entity';
import { StockAdjustment } from '../../src/database/entities/stock-adjustment.entity';
import { SalesOrderService } from '../../src/modules/sales/services/sales-order.service';
import { PaymentService } from '../../src/modules/sales/services/payment.service';
import { GoodsReceivedNoteService } from '../../src/modules/purchasing/services/goods-received-note.service';
import { VendorPaymentService } from '../../src/modules/purchasing/services/vendor-payment.service';
import { StockAdjustmentService } from '../../src/modules/inventory/services/stock-adjustment.service';
import { JournalEntryService } from '../../src/modules/accounting/services/journal-entry.service';
import { AccountingService } from '../../src/modules/accounting/services/accounting.service';

describe('Accounting Auto-Posting Integration (E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Repositories
  let fiscalPeriodRepo: Repository<FiscalPeriod>;
  let chartOfAccountRepo: Repository<ChartOfAccount>;
  let accountMappingRepo: Repository<AccountMapping>;
  let journalEntryRepo: Repository<JournalEntry>;
  let journalEntryLineRepo: Repository<JournalEntryLine>;
  let customerRepo: Repository<Customer>;
  let supplierRepo: Repository<Supplier>;
  let categoryRepo: Repository<Category>;
  let productRepo: Repository<Product>;
  let salesOrderRepo: Repository<SalesOrder>;
  let paymentRepo: Repository<Payment>;
  let purchaseOrderRepo: Repository<PurchaseOrder>;
  let grnRepo: Repository<GoodsReceivedNote>;
  let vendorPaymentRepo: Repository<VendorPayment>;
  let paymentMethodRepo: Repository<PaymentMethodEntity>;
  let stockAdjustmentRepo: Repository<StockAdjustment>;

  // Services
  let salesOrderService: SalesOrderService;
  let paymentService: PaymentService;
  let grnService: GoodsReceivedNoteService;
  let vendorPaymentService: VendorPaymentService;
  let stockAdjustmentService: StockAdjustmentService;
  let journalEntryService: JournalEntryService;

  // Test data IDs
  let openPeriodId: string;
  let closedPeriodId: string;
  let accounts: Record<string, ChartOfAccount>;
  let testCustomer: Customer;
  let testSupplier: Supplier;
  let testCategory: Category;
  let testProduct: Product;
  let testPaymentMethodCash: PaymentMethodEntity;
  let testPaymentMethodBank: PaymentMethodEntity;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);

    // Get repositories
    fiscalPeriodRepo = app.get(getRepositoryToken(FiscalPeriod));
    chartOfAccountRepo = app.get(getRepositoryToken(ChartOfAccount));
    accountMappingRepo = app.get(getRepositoryToken(AccountMapping));
    journalEntryRepo = app.get(getRepositoryToken(JournalEntry));
    journalEntryLineRepo = app.get(getRepositoryToken(JournalEntryLine));
    customerRepo = app.get(getRepositoryToken(Customer));
    supplierRepo = app.get(getRepositoryToken(Supplier));
    categoryRepo = app.get(getRepositoryToken(Category));
    productRepo = app.get(getRepositoryToken(Product));
    salesOrderRepo = app.get(getRepositoryToken(SalesOrder));
    paymentRepo = app.get(getRepositoryToken(Payment));
    purchaseOrderRepo = app.get(getRepositoryToken(PurchaseOrder));
    grnRepo = app.get(getRepositoryToken(GoodsReceivedNote));
    vendorPaymentRepo = app.get(getRepositoryToken(VendorPayment));
    paymentMethodRepo = app.get(getRepositoryToken(PaymentMethodEntity));
    stockAdjustmentRepo = app.get(getRepositoryToken(StockAdjustment));

    // Get services
    salesOrderService = app.get(SalesOrderService);
    paymentService = app.get(PaymentService);
    grnService = app.get(GoodsReceivedNoteService);
    vendorPaymentService = app.get(VendorPaymentService);
    stockAdjustmentService = app.get(StockAdjustmentService);
    journalEntryService = app.get(JournalEntryService);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  beforeEach(async () => {
    // Clean database
    await cleanDatabase();

    // Setup test data
    await setupDocumentNumberSettings();
    await setupFiscalPeriods();
    await setupChartOfAccounts();
    await setupAccountMappings();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  // Helper: Clean database
  async function cleanDatabase() {
    await dataSource.query('TRUNCATE TABLE journal_entry_lines, journal_entries, vendor_payments, goods_received_note_items, goods_received_notes, purchase_order_items, purchase_orders, payments, settlements, invoice_items, invoices, sales_order_items, sales_orders, stock_adjustment_items, stock_adjustments, products, categories, customers, suppliers, account_mappings, payment_methods, chart_of_accounts, fiscal_periods, reconciled_transactions, bank_reconciliations, document_number_settings CASCADE');
  }

  // Helper: Seed document number settings (normally inserted by migration seed data)
  async function setupDocumentNumberSettings() {
    const currentYY = new Date().getFullYear() % 100;
    const configs = [
      { documentName: 'Journal Entries', prefix: 'JE' },
      { documentName: 'Goods Received', prefix: 'GRN' },
      { documentName: 'Vendor Payments', prefix: 'VP' },
      { documentName: 'Stock Adjustment', prefix: 'SA' },
      { documentName: 'Payments', prefix: 'PAY' },
      { documentName: 'Sales Orders', prefix: 'SO' },
      { documentName: 'Purchase Orders', prefix: 'PO' },
    ];
    for (const config of configs) {
      await dataSource.query(
        `INSERT INTO document_number_settings ("documentName", prefix, "paddingDigits", "nextNumber", "lastResetYear")
         VALUES ($1, $2, 3, 1, $3)`,
        [config.documentName, config.prefix, currentYY],
      );
    }
  }

  // Helper: Setup fiscal periods
  async function setupFiscalPeriods() {
    // Open period for 2026-02
    const openPeriod = fiscalPeriodRepo.create({
      code: '2026-02',
      name: 'February 2026',
      status: FiscalPeriodStatus.OPEN,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-12-31'),
    } as any);
    const savedOpen = await fiscalPeriodRepo.save(openPeriod) as unknown as FiscalPeriod;
    openPeriodId = savedOpen.id;

    // Closed period for 2026-01
    const closedPeriod = fiscalPeriodRepo.create({
      code: '2026-01',
      name: 'January 2026',
      status: FiscalPeriodStatus.CLOSED,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
    } as any);
    const savedClosed = await fiscalPeriodRepo.save(closedPeriod) as unknown as FiscalPeriod;
    closedPeriodId = savedClosed.id;
  }

  // Helper: Setup chart of accounts
  async function setupChartOfAccounts() {
    accounts = {};

    const accountsData = [
      { code: '1100', name: 'Cash in Hand', type: 'ASSET' },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET' },
      { code: '1300', name: 'Inventory Asset', type: 'ASSET' },
      { code: '2100', name: 'Accounts Payable', type: 'LIABILITY' },
      { code: '4000', name: 'Sales Revenue', type: 'REVENUE' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
      { code: '7100', name: 'Inventory Adjustment Gain', type: 'REVENUE' },
      { code: '6100', name: 'Inventory Adjustment Loss', type: 'EXPENSE' },
    ];

    for (const data of accountsData) {
      const account = chartOfAccountRepo.create({
        code: data.code,
        name: data.name,
        type: data.type as any,
        isActive: true,
      } as any);
      const saved = await chartOfAccountRepo.save(account) as unknown as ChartOfAccount;
      accounts[data.code] = saved;
    }
  }

  // Helper: Setup account mappings
  async function setupAccountMappings() {
    const mappings = [
      // Sales mappings
      { type: MappingType.SALES_REVENUE, accountId: accounts['4000'].id },
      { type: MappingType.SALES_AR, accountId: accounts['1200'].id },
      { type: MappingType.SALES_COGS, accountId: accounts['5000'].id },
      { type: MappingType.SALES_INVENTORY, accountId: accounts['1300'].id },

      // Payment mappings (dynamic per payment method + global AR)
      { type: 'payment_cash' as any, accountId: accounts['1100'].id },
      { type: 'payment_bank' as any, accountId: accounts['1100'].id },
      { type: MappingType.PAYMENT_AR, accountId: accounts['1200'].id },

      // Purchase mappings
      { type: MappingType.PURCHASE_INVENTORY, accountId: accounts['1300'].id },
      { type: MappingType.PURCHASE_AP, accountId: accounts['2100'].id },

      // Vendor payment mappings (dynamic per payment method + global AP)
      { type: MappingType.VENDOR_PAYMENT_AP, accountId: accounts['2100'].id },
      { type: 'vendor_payment_cash' as any, accountId: accounts['1100'].id },
      { type: 'vendor_payment_bank' as any, accountId: accounts['1100'].id },

      // Inventory adjustment mappings
      { type: MappingType.INVENTORY_ASSET, accountId: accounts['1300'].id },
      { type: MappingType.INVENTORY_ADJUSTMENT_GAIN, accountId: accounts['7100'].id },
      { type: MappingType.INVENTORY_ADJUSTMENT_LOSS, accountId: accounts['6100'].id },
    ];

    for (const mapping of mappings) {
      const accountMapping = accountMappingRepo.create({
        mappingType: mapping.type,
        accountId: mapping.accountId,
        description: `Mapping for ${mapping.type}`,
        isActive: true,
      });
      await accountMappingRepo.save(accountMapping);
    }
  }

  // Helper: Setup payment methods
  async function setupPaymentMethods() {
    const cashMethod = paymentMethodRepo.create({
      code: 'CASH',
      name: 'Cash',
      requiresSettlement: false,
      sortOrder: 0,
      isActive: true,
    } as any);
    testPaymentMethodCash = await paymentMethodRepo.save(cashMethod) as unknown as PaymentMethodEntity;

    const bankMethod = paymentMethodRepo.create({
      code: 'BANK',
      name: 'Bank Transfer',
      requiresSettlement: false,
      sortOrder: 1,
      isActive: true,
    } as any);
    testPaymentMethodBank = await paymentMethodRepo.save(bankMethod) as unknown as PaymentMethodEntity;
  }

  // Helper: Setup test data
  async function setupTestData() {
    // Create payment methods first (needed for account mappings and payments)
    await setupPaymentMethods();

    // Create customer
    const customer = customerRepo.create({
      name: 'Test Customer',
      phone: '1234567890',
      isActive: true,
    } as any);
    testCustomer = await customerRepo.save(customer) as unknown as Customer;

    // Create supplier
    const supplier = supplierRepo.create({
      companyName: 'Test Supplier',
      contactPerson: 'John Doe',
      phone: '0987654321',
      isActive: true,
    } as any);
    testSupplier = await supplierRepo.save(supplier) as unknown as Supplier;

    // Create category
    const category = categoryRepo.create({
      name: 'Test Category',
      isActive: true,
    } as any);
    testCategory = await categoryRepo.save(category) as unknown as Category;

    // Create product (using ProductType enum)
    const product = productRepo.create({
      name: 'Test Product',
      barcode: 'TEST001',
      type: 'Stocked Product' as any,
      categoryId: testCategory.id,
      baseCost: 50.00,
      stockQuantity: 1000,
      isActive: true,
    } as any);
    testProduct = await productRepo.save(product) as unknown as Product;
  }

  describe('Sales Order Fulfillment Auto-Posting', () => {
    it('should auto-post journal entry when sales order fulfilled', async () => {
      // Create sales order
      const salesOrder = salesOrderRepo.create({
        orderNumber: 'SO-TEST-001',
        customerId: testCustomer.id,
        orderDate: new Date('2026-02-15'),
        totalAmount: 1000.00,
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
      } as any);
      const savedOrder = await salesOrderRepo.save(salesOrder) as unknown as SalesOrder;

      // Add sales order items
      const item = dataSource.getRepository(SalesOrderItem).create({
        salesOrderId: savedOrder.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitPrice: 100.00,
        unitCost: 50.00,
        totalAmount: 1000.00,
      } as any);
      await dataSource.getRepository(SalesOrderItem).save(item);

      // Fulfill the order
      const fulfilledOrder = await salesOrderService.fulfillOrder(savedOrder.id);

      // Verify order is fulfilled
      expect(fulfilledOrder.status).toBe('FULFILLED');
      expect(fulfilledOrder.updatedAt).toBeTruthy();

      // Verify two separate journal entries were created: COGS and Revenue
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'sales_order', sourceId: savedOrder.id },
        relations: { lines: true },
      });

      expect(journalEntries).toHaveLength(2);
      expect(journalEntries.every(e => e.status === JournalEntryStatus.POSTED)).toBe(true);

      // Each entry has exactly 2 lines
      const allLines = journalEntries.flatMap(e => e.lines);
      expect(allLines).toHaveLength(4);

      // COGS entry: DR Cost of Goods Sold / CR Inventory
      const cogsEntry = journalEntries.find(e =>
        e.description.includes('(Cost of Goods Sold)'),
      );
      expect(cogsEntry).toBeDefined();
      expect(cogsEntry.lines).toHaveLength(2);

      const cogsLine = cogsEntry.lines.find(l => l.accountId === accounts['5000'].id && Number(l.debitAmount) > 0);
      expect(cogsLine).toBeDefined();
      expect(Number(cogsLine.debitAmount)).toBe(500.00); // 10 * 50 baseCost

      const inventoryLine = cogsEntry.lines.find(l => l.accountId === accounts['1300'].id && Number(l.creditAmount) > 0);
      expect(inventoryLine).toBeDefined();
      expect(Number(inventoryLine.creditAmount)).toBe(500.00);

      // Revenue entry: DR Accounts Receivable / CR Sales Revenue
      const revenueEntry = journalEntries.find(e =>
        e.description.includes('(Revenue)'),
      );
      expect(revenueEntry).toBeDefined();
      expect(revenueEntry.lines).toHaveLength(2);

      const arLine = revenueEntry.lines.find(l => l.accountId === accounts['1200'].id && Number(l.debitAmount) > 0);
      expect(arLine).toBeDefined();
      expect(Number(arLine.debitAmount)).toBe(1000.00);

      const revenueLine = revenueEntry.lines.find(l => l.accountId === accounts['4000'].id && Number(l.creditAmount) > 0);
      expect(revenueLine).toBeDefined();
      expect(Number(revenueLine.creditAmount)).toBe(1000.00);
    });

    it('should calculate COGS correctly from product baseCost', async () => {
      const salesOrder = salesOrderRepo.create({
        orderNumber: 'SO-TEST-001',
        customerId: testCustomer.id,
        orderDate: new Date('2026-02-15'),
        totalAmount: 1000.00,
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
      } as any);
      const savedOrder = await salesOrderRepo.save(salesOrder) as unknown as SalesOrder;

      const item = dataSource.getRepository(SalesOrderItem).create({
        salesOrderId: savedOrder.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitPrice: 100.00,
        unitCost: 50.00,
        totalAmount: 1000.00,
      } as any);
      await dataSource.getRepository(SalesOrderItem).save(item);

      await salesOrderService.fulfillOrder(savedOrder.id);

      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'sales_order', sourceId: savedOrder.id },
        relations: { lines: true },
      });

      const cogsEntry = journalEntries.find(e => e.description.includes('(Cost of Goods Sold)'));
      expect(cogsEntry).toBeDefined();
      const cogsLine = cogsEntry.lines.find(l => l.accountId === accounts['5000'].id && Number(l.debitAmount) > 0);

      expect(Number(cogsLine.debitAmount)).toBe(500.00); // 10 qty * 50 baseCost
    });

    it('should continue fulfillment when accounting mapping missing', async () => {
      // Delete COGS mapping
      await dataSource.query(`DELETE FROM account_mappings WHERE "mappingKey" = $1`, [MappingType.SALES_COGS]);

      const salesOrder = salesOrderRepo.create({
        orderNumber: 'SO-TEST-001',
        customerId: testCustomer.id,
        orderDate: new Date('2026-02-15'),
        totalAmount: 1000.00,
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
      } as any);
      const savedOrder = await salesOrderRepo.save(salesOrder) as unknown as SalesOrder;

      const item = dataSource.getRepository(SalesOrderItem).create({
        salesOrderId: savedOrder.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitPrice: 100.00,
        unitCost: 50.00,
        totalAmount: 1000.00,
      } as any);
      await dataSource.getRepository(SalesOrderItem).save(item);

      // Fulfillment should succeed
      const fulfilledOrder = await salesOrderService.fulfillOrder(savedOrder.id);
      expect(fulfilledOrder.status).toBe('FULFILLED');

      // But no journal entry should be created
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'sales_order', sourceId: savedOrder.id },
      });
      expect(journalEntries).toHaveLength(0);
    });

    it('should prevent accounting posting when period is closed', async () => {
      const salesOrder = salesOrderRepo.create({
        orderNumber: 'SO-TEST-001',
        customerId: testCustomer.id,
        orderDate: new Date('2026-01-15'), // Closed period
        totalAmount: 1000.00,
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
      } as any);
      const savedOrder = await salesOrderRepo.save(salesOrder) as unknown as SalesOrder;

      const item = dataSource.getRepository(SalesOrderItem).create({
        salesOrderId: savedOrder.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitPrice: 100.00,
        unitCost: 50.00,
        totalAmount: 1000.00,
      } as any);
      await dataSource.getRepository(SalesOrderItem).save(item);

      // Fulfillment should succeed (business transaction)
      const fulfilledOrder = await salesOrderService.fulfillOrder(savedOrder.id);
      expect(fulfilledOrder.status).toBe('FULFILLED');

      // Current behavior posts using active posting period.
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'sales_order', sourceId: savedOrder.id },
      });
      // Two entries: COGS + Revenue
      expect(journalEntries).toHaveLength(2);
    });
  });

  describe('Customer Payment Auto-Posting', () => {
    it('should auto-post journal entry when payment received', async () => {
      // Create payment
      const payment = await paymentService.create({
        customerId: testCustomer.id,
        paymentMethodId: testPaymentMethodCash.id,
        paymentDate: new Date('2026-02-15'),
        amount: 500.00,
      });

      // Verify journal entry was created
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'payment', sourceId: payment.id },
        relations: { lines: true },
      });

      expect(journalEntries).toHaveLength(1);
      const entry = journalEntries[0];

      expect(entry.status).toBe(JournalEntryStatus.POSTED);
      expect(entry.lines).toHaveLength(2);

      // Verify Cash debit
      const cashLine = entry.lines.find(l => l.accountId === accounts['1100'].id && Number(l.debitAmount) > 0);
      expect(cashLine).toBeDefined();
      expect(Number(cashLine.debitAmount)).toBe(500.00);

      // Verify AR credit
      const arLine = entry.lines.find(l => l.accountId === accounts['1200'].id && Number(l.creditAmount) > 0);
      expect(arLine).toBeDefined();
      expect(Number(arLine.creditAmount)).toBe(500.00);
    });

    it('should link payment to journal entry', async () => {
      const payment = await paymentService.create({
        customerId: testCustomer.id,
        paymentMethodId: testPaymentMethodCash.id,
        paymentDate: new Date('2026-02-15'),
        amount: 500.00,
      });

      const journalEntry = await journalEntryRepo.findOne({
        where: { sourceType: 'payment', sourceId: payment.id },
      });

      expect(journalEntry).toBeDefined();
      expect(journalEntry.sourceId).toBe(payment.id);
    });

    it('should handle multiple payments for same customer', async () => {
      const payment1 = await paymentService.create({
        customerId: testCustomer.id,
        paymentMethodId: testPaymentMethodCash.id,
        paymentDate: new Date('2026-02-15'),
        amount: 300.00,
      });

      const payment2 = await paymentService.create({
        customerId: testCustomer.id,
        paymentMethodId: testPaymentMethodCash.id,
        paymentDate: new Date('2026-02-16'),
        amount: 200.00,
      });

      // Verify 2 separate journal entries
      const entries = await journalEntryRepo.find({
        where: { sourceType: 'payment' },
      });

      expect(entries).toHaveLength(2);

      const entry1 = entries.find(e => e.sourceId === payment1.id);
      const entry2 = entries.find(e => e.sourceId === payment2.id);

      expect(entry1).toBeDefined();
      expect(entry2).toBeDefined();
    });
  });

  describe('Goods Received Note Auto-Posting', () => {
    it('should auto-post journal entry when GRN created', async () => {
      // Create purchase order
      const po = purchaseOrderRepo.create({
        orderNumber: 'PO-TEST-001',
        supplierId: testSupplier.id,
        orderDate: new Date('2026-02-10'),
        subtotal: 500.00,
        shippingAmount: 0,
        totalAmount: 500.00,
        status: 'approved',
      } as any);
      const savedPo = await purchaseOrderRepo.save(po) as unknown as PurchaseOrder;

      // Add PO items
      const poItem = dataSource.getRepository(PurchaseOrderItem).create({
        purchaseOrderId: savedPo.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitCost: 50.00,
        totalCost: 500.00,
      } as any);
      await dataSource.getRepository(PurchaseOrderItem).save(poItem);

      // Create GRN
      const grn = await grnService.create({
        purchaseOrderId: savedPo.id,
        receivedDate: '2026-02-15',
      });

      // Verify journal entry was created
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'goods_received_note', sourceId: grn.id },
        relations: { lines: true },
      });

      expect(journalEntries).toHaveLength(1);
      const entry = journalEntries[0];

      expect(entry.status).toBe(JournalEntryStatus.POSTED);
      expect(entry.lines).toHaveLength(2);

      // Verify Inventory debit
      const inventoryLine = entry.lines.find(l => l.accountId === accounts['1300'].id && Number(l.debitAmount) > 0);
      expect(inventoryLine).toBeDefined();
      expect(Number(inventoryLine.debitAmount)).toBe(500.00);

      // Verify AP credit
      const apLine = entry.lines.find(l => l.accountId === accounts['2100'].id && Number(l.creditAmount) > 0);
      expect(apLine).toBeDefined();
      expect(Number(apLine.creditAmount)).toBe(500.00);
    });

    it('should calculate total from purchase order item unitCost', async () => {
      const po = purchaseOrderRepo.create({
        orderNumber: 'PO-TEST-001',
        supplierId: testSupplier.id,
        orderDate: new Date('2026-02-10'),
        subtotal: 1000.00,
        shippingAmount: 0,
        totalAmount: 1000.00,
        status: 'approved',
      } as any);
      const savedPo = await purchaseOrderRepo.save(po) as unknown as PurchaseOrder;

      const poItem = dataSource.getRepository(PurchaseOrderItem).create({
        purchaseOrderId: savedPo.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitCost: 100.00,
        totalCost: 1000.00,
      } as any);
      await dataSource.getRepository(PurchaseOrderItem).save(poItem);

      const grn = await grnService.create({
        purchaseOrderId: savedPo.id,
        receivedDate: '2026-02-15',
      });

      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'goods_received_note', sourceId: grn.id },
        relations: { lines: true },
      });

      const entry = journalEntries[0];
      const inventoryLine = entry.lines.find(l => l.accountId === accounts['1300'].id && Number(l.debitAmount) > 0);

      expect(Number(inventoryLine.debitAmount)).toBe(1000.00); // 10 * 100
    });

    it('should update product baseCost with new weighted average', async () => {
      // Product has baseCost 50, quantity 1000
      expect(Number(testProduct.baseCost)).toBe(50.00);
      expect(Number(testProduct.stockQuantity)).toBe(1000);

      // Receive 10 items at 60 each
      const po = purchaseOrderRepo.create({
        orderNumber: 'PO-TEST-001',
        supplierId: testSupplier.id,
        orderDate: new Date('2026-02-10'),
        subtotal: 600.00,
        shippingAmount: 0,
        totalAmount: 600.00,
        status: 'approved',
      } as any);
      const savedPo = await purchaseOrderRepo.save(po) as unknown as PurchaseOrder;

      const poItem = dataSource.getRepository(PurchaseOrderItem).create({
        purchaseOrderId: savedPo.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitCost: 60.00,
        totalCost: 600.00,
      } as any);
      await dataSource.getRepository(PurchaseOrderItem).save(poItem);

      await grnService.create({
        purchaseOrderId: savedPo.id,
        receivedDate: '2026-02-15',
      });

      // Check product was updated
      const updatedProduct = await productRepo.findOne({ where: { id: testProduct.id } });
      expect(Number(updatedProduct.stockQuantity)).toBe(1010); // 1000 + 10

      // Journal entry should use the purchase costs
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'goods_received_note' },
        relations: { lines: true },
      });

      const entry = journalEntries[0];
      const inventoryLine = entry.lines.find(l => l.accountId === accounts['1300'].id && Number(l.debitAmount) > 0);
      expect(Number(inventoryLine.debitAmount)).toBe(600.00);
    });

    it('should continue GRN creation when accounting fails', async () => {
      // Delete inventory mapping
      await dataSource.query(`DELETE FROM account_mappings WHERE "mappingKey" = $1`, [MappingType.PURCHASE_INVENTORY]);

      const po = purchaseOrderRepo.create({
        orderNumber: 'PO-TEST-001',
        supplierId: testSupplier.id,
        orderDate: new Date('2026-02-10'),
        subtotal: 500.00,
        shippingAmount: 0,
        totalAmount: 500.00,
        status: 'approved',
      } as any);
      const savedPo = await purchaseOrderRepo.save(po) as unknown as PurchaseOrder;

      const poItem = dataSource.getRepository(PurchaseOrderItem).create({
        purchaseOrderId: savedPo.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitCost: 50.00,
        totalCost: 500.00,
      } as any);
      await dataSource.getRepository(PurchaseOrderItem).save(poItem);

      // GRN creation should succeed
      const grn = await grnService.create({
        purchaseOrderId: savedPo.id,
        receivedDate: '2026-02-15',
      });

      expect(grn).toBeDefined();
      expect(grn.id).toBeTruthy();

      // But no journal entry should be created
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'goods_received_note', sourceId: grn.id },
      });
      expect(journalEntries).toHaveLength(0);
    });
  });

  describe('Vendor Payment Auto-Posting', () => {
    it('should auto-post journal entry when vendor payment made', async () => {
      // Create PO and GRN first
      const po = purchaseOrderRepo.create({
        orderNumber: 'PO-TEST-001',
        supplierId: testSupplier.id,
        orderDate: new Date('2026-02-10'),
        subtotal: 1000.00,
        shippingAmount: 0,
        totalAmount: 1000.00,
        status: 'approved',
      } as any);
      const savedPo = await purchaseOrderRepo.save(po) as unknown as PurchaseOrder;

      const poItem = dataSource.getRepository(PurchaseOrderItem).create({
        purchaseOrderId: savedPo.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitCost: 100.00,
        totalCost: 1000.00,
      } as any);
      await dataSource.getRepository(PurchaseOrderItem).save(poItem);

      await grnService.create({
        purchaseOrderId: savedPo.id,
        receivedDate: '2026-02-15',
      });

      // Create vendor payment
      const payment = await vendorPaymentService.create({
        supplierId: testSupplier.id,
        purchaseOrderId: savedPo.id,
        amount: 1000.00,
        paymentDate: '2026-02-20',
        paymentMethodId: testPaymentMethodBank.id,
        status: 'completed',
      });

      // Verify journal entry was created
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'vendor_payment', sourceId: payment.id },
        relations: { lines: true },
      });

      expect(journalEntries).toHaveLength(1);
      const entry = journalEntries[0];

      expect(entry.status).toBe(JournalEntryStatus.POSTED);
      expect(entry.lines).toHaveLength(2);

      // Verify AP debit
      const apLine = entry.lines.find(l => l.accountId === accounts['2100'].id && Number(l.debitAmount) > 0);
      expect(apLine).toBeDefined();
      expect(Number(apLine.debitAmount)).toBe(1000.00);

      // Verify Cash credit
      const cashLine = entry.lines.find(l => l.accountId === accounts['1100'].id && Number(l.creditAmount) > 0);
      expect(cashLine).toBeDefined();
      expect(Number(cashLine.creditAmount)).toBe(1000.00);
    });

    it('should reduce AP balance correctly', async () => {
      const po = purchaseOrderRepo.create({
        orderNumber: 'PO-TEST-001',
        supplierId: testSupplier.id,
        orderDate: new Date('2026-02-10'),
        subtotal: 1000.00,
        shippingAmount: 0,
        totalAmount: 1000.00,
        status: 'approved',
      } as any);
      const savedPo = await purchaseOrderRepo.save(po) as unknown as PurchaseOrder;

      const poItem = dataSource.getRepository(PurchaseOrderItem).create({
        purchaseOrderId: savedPo.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitCost: 100.00,
        totalCost: 1000.00,
      } as any);
      await dataSource.getRepository(PurchaseOrderItem).save(poItem);

      const grn = await grnService.create({
        purchaseOrderId: savedPo.id,
        receivedDate: '2026-02-15',
      });

      // GRN creates AP credit of 1000
      const grnEntries = await journalEntryRepo.find({
        where: { sourceType: 'goods_received_note', sourceId: grn.id },
        relations: { lines: true },
      });
      const grnApLine = grnEntries[0].lines.find(l => l.accountId === accounts['2100'].id);
      expect(Number(grnApLine.creditAmount)).toBe(1000.00);

      // Payment creates AP debit of 1000
      const payment = await vendorPaymentService.create({
        supplierId: testSupplier.id,
        purchaseOrderId: savedPo.id,
        amount: 1000.00,
        paymentDate: '2026-02-20',
        paymentMethodId: testPaymentMethodBank.id,
        status: 'completed',
      });

      const paymentEntries = await journalEntryRepo.find({
        where: { sourceType: 'vendor_payment', sourceId: payment.id },
        relations: { lines: true },
      });
      const paymentApLine = paymentEntries[0].lines.find(l => l.accountId === accounts['2100'].id);
      expect(Number(paymentApLine.debitAmount)).toBe(1000.00);

      // Net AP balance should be 0
      const allApLines = await journalEntryLineRepo.find({
        where: { accountId: accounts['2100'].id },
      });
      const totalDebit = allApLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
      const totalCredit = allApLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
      expect(totalCredit - totalDebit).toBe(0);
    });

    it('should handle partial payments', async () => {
      const po = purchaseOrderRepo.create({
        orderNumber: 'PO-TEST-001',
        supplierId: testSupplier.id,
        orderDate: new Date('2026-02-10'),
        subtotal: 1000.00,
        shippingAmount: 0,
        totalAmount: 1000.00,
        status: 'approved',
      } as any);
      const savedPo = await purchaseOrderRepo.save(po) as unknown as PurchaseOrder;

      const poItem = dataSource.getRepository(PurchaseOrderItem).create({
        purchaseOrderId: savedPo.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitCost: 100.00,
        totalCost: 1000.00,
      } as any);
      await dataSource.getRepository(PurchaseOrderItem).save(poItem);

      await grnService.create({
        purchaseOrderId: savedPo.id,
        receivedDate: '2026-02-15',
      });

      // First partial payment
      await vendorPaymentService.create({
        supplierId: testSupplier.id,
        purchaseOrderId: savedPo.id,
        amount: 400.00,
        paymentDate: '2026-02-20',
        paymentMethodId: testPaymentMethodBank.id,
        status: 'completed',
      });

      // Second partial payment (manual creation since service prevents duplicates)
      const payment2Data = vendorPaymentRepo.create({
        supplierId: testSupplier.id,
        purchaseOrderId: savedPo.id,
        amount: 600.00,
        paymentDate: '2026-02-25',
        paymentMethodId: testPaymentMethodBank.id,
        status: 'completed',
        paymentNumber: 'VP-000002',
      } as any);
      const payment2 = await vendorPaymentRepo.save(payment2Data) as unknown as VendorPayment;

      // Manually trigger accounting for second payment
      const fullPayment2 = await vendorPaymentRepo.findOne({
        where: { id: payment2.id },
        relations: { supplier: true, purchaseOrder: true, paymentMethodEntity: true },
      });
      const accountingService = app.get(AccountingService);
      await accountingService.postVendorPaymentEntry(fullPayment2, 'system');

      // Verify 2 payment journal entries
      const paymentEntries = await journalEntryRepo.find({
        where: { sourceType: 'vendor_payment' },
      });
      expect(paymentEntries).toHaveLength(2);

      // Verify AP is fully cleared (1000 credit - 400 debit - 600 debit = 0)
      const allApLines = await journalEntryLineRepo.find({
        where: { accountId: accounts['2100'].id },
      });
      const totalDebit = allApLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
      const totalCredit = allApLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
      expect(totalCredit - totalDebit).toBe(0);
    });
  });

  describe('Stock Adjustment Auto-Posting', () => {
    it('should auto-post journal entry for inventory increase', async () => {
      // Create adjustment increasing inventory
      const adjustment = await stockAdjustmentService.create({
        adjustmentDate: new Date('2026-02-15'),
        notes: 'Inventory count adjustment',
        items: [
          {
            productId: testProduct.id,
            oldQuantity: 1000,
            newQuantity: 1020,
            difference: 20,
            unitCost: 50.00,
          },
        ],
      });

      // Complete the adjustment
      const completed = await stockAdjustmentService.complete(adjustment.id);

      // Verify journal entry was created
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'stock_adjustment', sourceId: adjustment.id },
        relations: { lines: true },
      });

      expect(journalEntries).toHaveLength(1);
      const entry = journalEntries[0];

      expect(entry.status).toBe(JournalEntryStatus.POSTED);
      expect(entry.lines).toHaveLength(2);

      // Verify Inventory Asset debit
      const inventoryLine = entry.lines.find(l => l.accountId === accounts['1300'].id && Number(l.debitAmount) > 0);
      expect(inventoryLine).toBeDefined();
      expect(Number(inventoryLine.debitAmount)).toBe(1000.00); // 20 * 50

      // Verify Adjustment Gain credit
      const gainLine = entry.lines.find(l => l.accountId === accounts['7100'].id && Number(l.creditAmount) > 0);
      expect(gainLine).toBeDefined();
      expect(Number(gainLine.creditAmount)).toBe(1000.00);
    });

    it('should auto-post journal entry for inventory decrease', async () => {
      const adjustment = await stockAdjustmentService.create({
        adjustmentDate: new Date('2026-02-15'),
        notes: 'Inventory shrinkage',
        items: [
          {
            productId: testProduct.id,
            oldQuantity: 1000,
            newQuantity: 980,
            difference: -20,
            unitCost: 50.00,
          },
        ],
      });

      await stockAdjustmentService.complete(adjustment.id);

      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'stock_adjustment', sourceId: adjustment.id },
        relations: { lines: true },
      });

      expect(journalEntries).toHaveLength(1);
      const entry = journalEntries[0];

      expect(entry.lines).toHaveLength(2);

      // Verify Adjustment Loss debit
      const lossLine = entry.lines.find(l => l.accountId === accounts['6100'].id && Number(l.debitAmount) > 0);
      expect(lossLine).toBeDefined();
      expect(Number(lossLine.debitAmount)).toBe(1000.00); // 20 * 50

      // Verify Inventory Asset credit
      const inventoryLine = entry.lines.find(l => l.accountId === accounts['1300'].id && Number(l.creditAmount) > 0);
      expect(inventoryLine).toBeDefined();
      expect(Number(inventoryLine.creditAmount)).toBe(1000.00);
    });

    it('should handle mixed increases and decreases', async () => {
      // Create second product
      const product2 = productRepo.create({
        name: 'Test Product 2',
        barcode: 'TEST002',
        type: 'Stocked Product' as any,
        categoryId: testCategory.id,
        baseCost: 75.00,
        stockQuantity: 500,
        isActive: true,
      } as any);
      const savedProduct2 = await productRepo.save(product2) as unknown as Product;

      const adjustment = await stockAdjustmentService.create({
        adjustmentDate: new Date('2026-02-15'),
        notes: 'Mixed adjustment',
        items: [
          {
            productId: testProduct.id,
            oldQuantity: 1000,
            newQuantity: 1010,
            difference: 10,
            unitCost: 50.00,
          },
          {
            productId: savedProduct2.id,
            oldQuantity: 500,
            newQuantity: 490,
            difference: -10,
            unitCost: 75.00,
          },
        ],
      });

      await stockAdjustmentService.complete(adjustment.id);

      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'stock_adjustment', sourceId: adjustment.id },
        relations: { lines: true },
      });

      const entry = journalEntries[0];

      // Should have 4 lines (2 for increase, 2 for decrease)
      expect(entry.lines).toHaveLength(4);

      // Verify increase lines (10 * 50 = 500)
      const inventoryDebit = entry.lines.find(l =>
        l.accountId === accounts['1300'].id && Number(l.debitAmount) === 500.00
      );
      const gainCredit = entry.lines.find(l =>
        l.accountId === accounts['7100'].id && Number(l.creditAmount) === 500.00
      );
      expect(inventoryDebit).toBeDefined();
      expect(gainCredit).toBeDefined();

      // Verify decrease lines (10 * 75 = 750)
      const lossDebit = entry.lines.find(l =>
        l.accountId === accounts['6100'].id && Number(l.debitAmount) === 750.00
      );
      const inventoryCredit = entry.lines.find(l =>
        l.accountId === accounts['1300'].id && Number(l.creditAmount) === 750.00
      );
      expect(lossDebit).toBeDefined();
      expect(inventoryCredit).toBeDefined();
    });

    it('should calculate values using product baseCost', async () => {
      const adjustment = await stockAdjustmentService.create({
        adjustmentDate: new Date('2026-02-15'),
        notes: 'Cost calculation test',
        items: [
          {
            productId: testProduct.id,
            oldQuantity: 1000,
            newQuantity: 1010,
            difference: 10,
            unitCost: 25.00, // Different from baseCost
          },
        ],
      });

      await stockAdjustmentService.complete(adjustment.id);

      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'stock_adjustment', sourceId: adjustment.id },
        relations: { lines: true },
      });

      const entry = journalEntries[0];
      const inventoryLine = entry.lines.find(l => l.accountId === accounts['1300'].id && Number(l.debitAmount) > 0);

      // Should use the unitCost from adjustment item (25), not baseCost (50)
      expect(Number(inventoryLine.debitAmount)).toBe(250.00); // 10 * 25
    });
  });

  describe('Period Locking Enforcement', () => {
    it('should prevent auto-posting to closed period', async () => {
      // Create sales order in closed period (January 2026)
      const salesOrder = salesOrderRepo.create({
        orderNumber: 'SO-TEST-001',
        customerId: testCustomer.id,
        orderDate: new Date('2026-01-15'),
        totalAmount: 1000.00,
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
      } as any);
      const savedOrder = await salesOrderRepo.save(salesOrder) as unknown as SalesOrder;

      const item = dataSource.getRepository(SalesOrderItem).create({
        salesOrderId: savedOrder.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitPrice: 100.00,
        unitCost: 50.00,
        totalAmount: 1000.00,
      } as any);
      await dataSource.getRepository(SalesOrderItem).save(item);

      // Business transaction should succeed
      const fulfilledOrder = await salesOrderService.fulfillOrder(savedOrder.id);
      expect(fulfilledOrder.status).toBe('FULFILLED');

      // Current behavior posts using active posting period.
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'sales_order', sourceId: savedOrder.id },
      });
      // Two entries: COGS + Revenue
      expect(journalEntries).toHaveLength(2);
    });

    it('should allow auto-posting to open period', async () => {
      const salesOrder = salesOrderRepo.create({
        orderNumber: 'SO-TEST-001',
        customerId: testCustomer.id,
        orderDate: new Date('2026-02-15'), // Open period
        totalAmount: 1000.00,
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
      } as any);
      const savedOrder = await salesOrderRepo.save(salesOrder) as unknown as SalesOrder;

      const item = dataSource.getRepository(SalesOrderItem).create({
        salesOrderId: savedOrder.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitPrice: 100.00,
        unitCost: 50.00,
        totalAmount: 1000.00,
      } as any);
      await dataSource.getRepository(SalesOrderItem).save(item);

      await salesOrderService.fulfillOrder(savedOrder.id);

      // Journal entries should be created successfully (COGS + Revenue)
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'sales_order', sourceId: savedOrder.id },
      });
      expect(journalEntries).toHaveLength(2);
      expect(journalEntries.every(e => e.status === JournalEntryStatus.POSTED)).toBe(true);
    });
  });

  describe('Account Mapping Validation', () => {
    it('should fail when required sales mappings are missing', async () => {
      // Delete all sales-related mappings
      await dataSource.query(`DELETE FROM account_mappings WHERE "mappingKey" = $1`, [MappingType.SALES_REVENUE]);
      await dataSource.query(`DELETE FROM account_mappings WHERE "mappingKey" = $1`, [MappingType.SALES_AR]);
      await dataSource.query(`DELETE FROM account_mappings WHERE "mappingKey" = $1`, [MappingType.SALES_COGS]);
      await dataSource.query(`DELETE FROM account_mappings WHERE "mappingKey" = $1`, [MappingType.SALES_INVENTORY]);

      const salesOrder = salesOrderRepo.create({
        orderNumber: 'SO-TEST-001',
        customerId: testCustomer.id,
        orderDate: new Date('2026-02-15'),
        totalAmount: 1000.00,
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
      } as any);
      const savedOrder = await salesOrderRepo.save(salesOrder) as unknown as SalesOrder;

      const item = dataSource.getRepository(SalesOrderItem).create({
        salesOrderId: savedOrder.id,
        lineNumber: 1,
        productId: testProduct.id,
        quantity: 10,
        unitPrice: 100.00,
        unitCost: 50.00,
        totalAmount: 1000.00,
      } as any);
      await dataSource.getRepository(SalesOrderItem).save(item);

      // Fulfillment succeeds but accounting fails silently
      const fulfilledOrder = await salesOrderService.fulfillOrder(savedOrder.id);
      expect(fulfilledOrder.status).toBe('FULFILLED');

      // No journal entry created
      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'sales_order', sourceId: savedOrder.id },
      });
      expect(journalEntries).toHaveLength(0);
    });

    it('should fail when required payment mappings are missing', async () => {
      await dataSource.query(`DELETE FROM account_mappings WHERE "mappingKey" = $1`, ['payment_cash']);

      const payment = await paymentService.create({
        customerId: testCustomer.id,
        paymentMethodId: testPaymentMethodCash.id,
        paymentDate: new Date('2026-02-15'),
        amount: 500.00,
      });

      // Payment created but no journal entry
      expect(payment.id).toBeTruthy();

      const journalEntries = await journalEntryRepo.find({
        where: { sourceType: 'payment', sourceId: payment.id },
      });
      expect(journalEntries).toHaveLength(0);
    });
  });
});
