import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ACCOUNTING_POSTING_PORT } from '../../../../common/accounting-posting/accounting-posting.port';
import { OwnerEquityStockService } from '../owner-equity-stock.service';
import {
  OwnerEquityDocument,
  OwnerEquityDocumentStatus,
  OwnerEquityType,
} from '../../entities/owner-equity-document.entity';
import {
  Product,
  ProductType,
} from '../../../../database/entities/product.entity';
import { StockMovementService } from '../../../inventory/services/stock-movement.service';
import { SettingsService } from '../../../settings/settings.service';
import { formatScale4 } from '@/common/utils/money';

describe('OwnerEquityStockService', () => {
  let stock: OwnerEquityStockService;
  let dataSource: any;
  let movementMock: any;
  let postingMock: any;
  let settingsService: { getRegionalSettings: any };
  let appTimezone: string;

  let currentDoc: any;
  let product: any;
  let txDocRepo: any;
  let txManager: any;

  const ref = 'EQ-26-010';
  const serviceRef = 'EQ-26-011';
  const completedRef = 'EQ-26-012';
  const zeroCostRef = 'EQ-26-013';

  function setDoc(overrides: Record<string, any> = {}) {
    currentDoc = {
      id: 'doc-1',
      referenceNumber: ref,
      equityDate: '2026-08-01',
      description: 'Owner stock drawing',
      notes: 'draw five',
      type: OwnerEquityType.STOCK_DRAWING,
      productId: 'prod-1',
      quantity: '2.0000',
      unitCost: null,
      totalCost: null,
      documentStatus: OwnerEquityDocumentStatus.DRAFT,
      completedAt: null,
      completedBy: null,
      ...overrides,
    };
    txDocRepo.findOne.mockResolvedValue(currentDoc);
    return currentDoc;
  }

  function refWithQty(qty: number): string {
    setDoc({
      referenceNumber: `EQ-26-2${qty}`,
      quantity: formatScale4(String(qty)),
    });
    return `EQ-26-2${qty}`;
  }

  beforeEach(async () => {
    appTimezone = 'Asia/Kuala_Lumpur';
    settingsService = {
      getRegionalSettings: (jest.fn as unknown as any)(async () => ({ timezone: appTimezone })),
    };
    movementMock = {
      create: (jest.fn as unknown as any)().mockResolvedValue({ id: 'mv-1' }),
      reverseMovement: (jest.fn as unknown as any)().mockResolvedValue({}),
    };
    postingMock = {
      postOwnerStockDrawing: (jest.fn as unknown as any)()
        .mockResolvedValue({ journalEntryId: 'je-9' }),
      reverseEntriesForDocument: (jest.fn as unknown as any)()
        .mockResolvedValue([{ journalEntryId: 'je-10' }]),
    };
    dataSource = { transaction: (jest.fn as unknown as any)() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerEquityStockService,
        { provide: StockMovementService, useValue: movementMock },
        { provide: ACCOUNTING_POSTING_PORT, useValue: postingMock },
        { provide: DataSource, useValue: dataSource },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    stock = module.get(OwnerEquityStockService);

    product = {
      id: 'prod-1',
      name: 'Widget',
      type: ProductType.GOODS,
      stockQuantity: 10,
      baseCost: 12.5,
    };
    txDocRepo = {
      findOne: (jest.fn as unknown as any)(),
      save: (jest.fn as unknown as any)(async (x: any) => {
        currentDoc = { ...x };
        return currentDoc;
      }),
    };
    txManager = {
      getRepository: (jest.fn as unknown as any)().mockImplementation((entity: any) => {
        if (entity === OwnerEquityDocument) return txDocRepo;
        return {};
      }),
      findOne: (jest.fn as unknown as any)().mockResolvedValue(product),
    };
    (dataSource.transaction as any).mockImplementation(
      async (cb: any) => cb(txManager),
    );

    setDoc();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('stock drawing complete', () => {
    it('rejects a SERVICE product', async () => {
      setDoc({ referenceNumber: serviceRef });
      product.type = ProductType.SERVICE;
      await expect(stock.complete(serviceRef)).rejects.toThrow('Stocked Product');
    });
    it('rejects quantity above available stock', async () => {
      product.stockQuantity = 3;
      await expect(stock.complete(refWithQty(5))).rejects.toThrow('exceeds available stock');
    });
    it('normalizes whole-number quantities in the insufficient-stock message', async () => {
      product.stockQuantity = 1;
      await expect(stock.complete(refWithQty(2))).rejects.toThrow(
        'Quantity 2 exceeds available stock 1',
      );
    });
    it('keeps meaningful decimals in the insufficient-stock message', async () => {
      product.stockQuantity = 1.25;
      setDoc({ referenceNumber: 'EQ-26-250', quantity: '2.5000' });
      await expect(stock.complete('EQ-26-250')).rejects.toThrow(
        'Quantity 2.5 exceeds available stock 1.25',
      );
    });
    it('keeps scale-4 precision in the insufficient-stock message', async () => {
      product.stockQuantity = 1.0001;
      setDoc({ referenceNumber: 'EQ-26-251', quantity: '2.0001' });
      await expect(stock.complete('EQ-26-251')).rejects.toThrow(
        'Quantity 2.0001 exceeds available stock 1.0001',
      );
    });
    it('snapshots unitCost from baseCost at complete time', async () => {
      product.baseCost = 12.5;               // changed AFTER the draft was created
      const doc = await stock.complete(ref);
      expect(doc.unitCost).toBe('12.5000');
      expect(doc.totalCost).toBe('25.0000');  // qty 2
    });
    it('creates an OWNER_DRAWING movement and posts the journal entry', async () => {
      await stock.complete(ref);
      expect(movementMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ movementType: 'owner_drawing', referenceType: 'owner_equity' }),
        undefined, expect.anything(),
      );
      expect(postingMock.postOwnerStockDrawing).toHaveBeenCalledWith(
        expect.objectContaining({ stockMovementId: 'mv-1', amount: '25.0000' }),
        expect.anything(),
      );
    });
    // Issue #1132: the JE takes the completion ACTION date, not doc.equityDate.
    // The clock is frozen so "today" cannot drift with the machine clock or
    // straddle midnight mid-test.
    it('dates the journal entry by the completion action date, not equityDate', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-24T09:30:00.000Z'));
      try {
        const doc = await stock.complete(ref);
        expect(postingMock.postOwnerStockDrawing).toHaveBeenCalledWith(
          expect.objectContaining({ entryDate: '2026-08-24' }),
          expect.anything(),
        );
        const [cmd] = postingMock.postOwnerStockDrawing.mock.calls[0];
        expect(cmd.entryDate).not.toBe(currentDoc.equityDate);   // '2026-08-01'
        expect(doc.completedAt.toISOString().slice(0, 10)).toBe('2026-08-24');
      } finally {
        jest.useRealTimers();
      }
    });
    describe('business-calendar entryDate (issue #1134)', () => {
      // 16:30Z is past the UTC+8 rollover (16:00Z): the UTC calendar date is
      // the 24th, the Asia/Kuala_Lumpur one the 25th. The #1132 tests above
      // freeze at 09:30Z, which is mid-UTC-day and therefore inert here.
      const FROZEN_INSTANT = new Date('2026-08-24T16:30:00.000Z');

      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(FROZEN_INSTANT);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('dates the journal entry in the configured timezone, not UTC', async () => {
        appTimezone = 'Asia/Kuala_Lumpur';
        await stock.complete(ref);
        expect(postingMock.postOwnerStockDrawing).toHaveBeenCalledWith(
          expect.objectContaining({ entryDate: '2026-08-25' }),
          expect.anything(),
        );
      });

      it('dates the journal entry by UTC when UTC is the configured timezone', async () => {
        appTimezone = 'UTC';
        await stock.complete(ref);
        expect(postingMock.postOwnerStockDrawing).toHaveBeenCalledWith(
          expect.objectContaining({ entryDate: '2026-08-24' }),
          expect.anything(),
        );
      });

      it('keeps completedAt the exact instant while entryDate is that instant in the app timezone', async () => {
        appTimezone = 'Asia/Kuala_Lumpur';
        const doc = await stock.complete(ref);
        // #1132: the JE date and completedAt come from ONE instant, so they can
        // never straddle a midnight boundary. #1134 changes only the calendar
        // that instant is resolved against — not the instant itself.
        expect(doc.completedAt.toISOString()).toBe('2026-08-24T16:30:00.000Z');
        const [cmd] = postingMock.postOwnerStockDrawing.mock.calls[0];
        expect(cmd.entryDate).toBe('2026-08-25');
      });
    });

    it('writes the movement but SKIPS the journal entry at zero cost', async () => {
      product.baseCost = 0;
      const doc = await stock.complete(ref);
      expect(movementMock.create).toHaveBeenCalled();
      expect(postingMock.postOwnerStockDrawing).not.toHaveBeenCalled();
      expect(doc.unitCost).toBe('0.0000');
      expect(doc.totalCost).toBe('0.0000');
    });
  });

  describe('stock drawing uncomplete', () => {
    it('creates a positive compensating movement, never reverseMovement', async () => {
      setDoc({
        referenceNumber: completedRef,
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        unitCost: '12.5000',
        totalCost: '25.0000',
        completedAt: new Date('2026-08-10'),
        completedBy: 'alice',
      });
      await stock.uncomplete(completedRef);
      expect(movementMock.reverseMovement).not.toHaveBeenCalled();
      expect(movementMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ movementType: 'owner_drawing_reversal', quantity: 2 }),
        undefined, expect.anything(),
      );
    });
    it('reverses the journal entry and returns to the DRAFT shape', async () => {
      setDoc({
        referenceNumber: completedRef,
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        unitCost: '12.5000',
        totalCost: '25.0000',
        completedAt: new Date('2026-08-10'),
        completedBy: 'alice',
      });
      const doc = await stock.uncomplete(completedRef);
      expect(postingMock.reverseEntriesForDocument).toHaveBeenCalled();
      expect(doc.documentStatus).toBe('DRAFT');
      expect(doc.unitCost).toBeNull();
      expect(doc.totalCost).toBeNull();
    });
    // Issue #1132: the reversal takes the Uncomplete action date.
    it('dates the reversal by the uncomplete action date, not equityDate', async () => {
      setDoc({
        referenceNumber: completedRef,
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        unitCost: '12.5000',
        totalCost: '25.0000',
        completedAt: new Date('2026-08-10'),
        completedBy: 'alice',
      });
      jest.useFakeTimers().setSystemTime(new Date('2026-08-24T09:30:00.000Z'));
      try {
        await stock.uncomplete(completedRef);
        const [, , , entryDate] =
          postingMock.reverseEntriesForDocument.mock.calls[0];
        expect(entryDate).toBe('2026-08-24');
        expect(entryDate).not.toBe('2026-08-01');   // doc.equityDate
      } finally {
        jest.useRealTimers();
      }
    });
    describe('business-calendar reversal entryDate (issue #1134)', () => {
      const FROZEN_INSTANT = new Date('2026-08-24T16:30:00.000Z');

      const seedCompleted = () =>
        setDoc({
          referenceNumber: completedRef,
          documentStatus: OwnerEquityDocumentStatus.COMPLETED,
          unitCost: '12.5000',
          totalCost: '25.0000',
          completedAt: new Date('2026-08-10'),
          completedBy: 'alice',
        });

      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(FROZEN_INSTANT);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('dates the reversal in the configured timezone, not UTC', async () => {
        appTimezone = 'Asia/Kuala_Lumpur';
        seedCompleted();
        await stock.uncomplete(completedRef);
        const [, , , entryDate] = postingMock.reverseEntriesForDocument.mock.calls[0];
        expect(entryDate).toBe('2026-08-25');
      });

      it('dates the reversal by UTC when UTC is the configured timezone', async () => {
        appTimezone = 'UTC';
        seedCompleted();
        await stock.uncomplete(completedRef);
        const [, , , entryDate] = postingMock.reverseEntriesForDocument.mock.calls[0];
        expect(entryDate).toBe('2026-08-24');
      });
    });

    it('tolerates a zero-cost document with no journal entry to reverse', async () => {
      setDoc({
        referenceNumber: zeroCostRef,
        documentStatus: OwnerEquityDocumentStatus.COMPLETED,
        unitCost: '0.0000',
        totalCost: '0.0000',
        completedAt: new Date('2026-08-10'),
        completedBy: 'alice',
      });
      postingMock.reverseEntriesForDocument.mockResolvedValue([]);
      await expect(stock.uncomplete(zeroCostRef)).resolves.toBeDefined();
    });
  });
});
