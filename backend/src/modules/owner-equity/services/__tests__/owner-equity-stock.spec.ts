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
import { formatScale4 } from '@/common/utils/money';

describe('OwnerEquityStockService', () => {
  let stock: OwnerEquityStockService;
  let dataSource: jest.Mocked<DataSource>;
  let movementMock: any;
  let postingMock: any;

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
    movementMock = {
      create: jest.fn().mockResolvedValue({ id: 'mv-1' }),
      reverseMovement: jest.fn().mockResolvedValue({}),
    };
    postingMock = {
      postOwnerStockDrawing: jest
        .fn()
        .mockResolvedValue({ journalEntryId: 'je-9' }),
      reverseEntriesForDocument: jest
        .fn()
        .mockResolvedValue([{ journalEntryId: 'je-10' }]),
    };
    dataSource = { transaction: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerEquityStockService,
        { provide: StockMovementService, useValue: movementMock },
        { provide: ACCOUNTING_POSTING_PORT, useValue: postingMock },
        { provide: DataSource, useValue: dataSource },
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
      findOne: jest.fn(),
      save: jest.fn(async (x: any) => {
        currentDoc = { ...x };
        return currentDoc;
      }),
    };
    txManager = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === OwnerEquityDocument) return txDocRepo;
        return {};
      }),
      findOne: jest.fn().mockResolvedValue(product),
    };
    (dataSource.transaction as jest.Mock).mockImplementation(
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
