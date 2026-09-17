import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ExportService } from '../../../common/services/export.service';
import { PricingService } from '../services/pricing.service';
import { ProductService } from '../services/product.service';
import { ProductController } from './product.controller';

const mockProductService = {
  findAll: (jest.fn as unknown as any)().mockResolvedValue({
    data: [
      {
        sku: 'P001',
        name: 'Widget',
        costPrice: 5,
        sellingPrice: 10,
        currentStock: 100,
        isActive: true,
      },
    ],
    meta: { total: 1, page: 1, limit: 50 },
  }),
};

const mockPricingService = {};

const mockExportService = {
  exportFlat: (jest.fn as unknown as any)().mockResolvedValue(Buffer.from('fake-excel')),
};

describe('ProductController /export', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        { provide: ProductService, useValue: mockProductService },
        { provide: PricingService, useValue: mockPricingService },
        { provide: ExportService, useValue: mockExportService },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('GET /inventory/products/export returns 200 with xlsx content-type', async () => {
    const res = await request(app.getHttpServer()).get('/inventory/products/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });
});

describe('ProductController /export currency precision (#1241)', () => {
  let app: INestApplication;
  let exportFlat: any;

  /**
   * Build an app whose ProductService returns one product, so each case can
   * control the exact stored values that reach the currency cells.
   */
  const buildApp = async (product: Record<string, unknown>) => {
    exportFlat = (jest.fn as unknown as any)().mockResolvedValue(Buffer.from('fake-excel'));
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        {
          provide: ProductService,
          useValue: {
            findAll: (jest.fn as unknown as any)().mockResolvedValue({
              data: [product],
              meta: { total: 1, page: 1, limit: 50 },
            }),
          },
        },
        { provide: PricingService, useValue: {} },
        { provide: ExportService, useValue: { exportFlat } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  };

  afterEach(() => app?.close());

  /** The row object handed to ExportService.exportFlat for the first product. */
  const exportedRow = (): any => exportFlat.mock.calls[0][2][0];

  it('never exports a negative sub-cent baseCost as -0.00', async () => {
    // #,##0.00 keeps the sign of a value that rounds to zero, so an unquantized
    // -0.0032 would render as "-0.00" in the spreadsheet.
    await buildApp({ name: 'Widget', baseCost: '-0.0032', priceListItems: [] });

    await request(app.getHttpServer()).get('/inventory/products/export').expect(200);

    const baseCost = exportedRow().baseCost;
    expect(Number(baseCost)).toBe(0);
    expect(Object.is(Number(baseCost), -0)).toBe(false);
  });

  it('quantizes a four-decimal baseCost to cents', async () => {
    // The issue cites products.baseCost = 10.2273 as a real stored value.
    await buildApp({ name: 'Widget', baseCost: '10.2273', priceListItems: [] });

    await request(app.getHttpServer()).get('/inventory/products/export').expect(200);

    expect(Number(exportedRow().baseCost)).toBe(10.23);
  });

  it('rounds ties away from zero for both signs', async () => {
    await buildApp({ name: 'Widget', baseCost: '1.005', priceListItems: [] });
    await request(app.getHttpServer()).get('/inventory/products/export').expect(200);
    expect(Number(exportedRow().baseCost)).toBe(1.01);
    await app.close();

    await buildApp({ name: 'Widget', baseCost: '-1.005', priceListItems: [] });
    await request(app.getHttpServer()).get('/inventory/products/export').expect(200);
    expect(Number(exportedRow().baseCost)).toBe(-1.01);
  });

  it('quantizes price-list currency values too', async () => {
    await buildApp({
      name: 'Widget',
      baseCost: '1.0000',
      priceListItems: [
        { price: '19.9999', priceList: { id: 'pl-1', name: 'Retail' } },
        { price: '-0.0032', priceList: { id: 'pl-2', name: 'Wholesale' } },
      ],
    });

    await request(app.getHttpServer()).get('/inventory/products/export').expect(200);

    const row = exportedRow();
    expect(Number(row['pl_pl-1'])).toBe(20);
    expect(Number(row['pl_pl-2'])).toBe(0);
    expect(Object.is(Number(row['pl_pl-2']), -0)).toBe(false);
  });

  it('still exports numbers, not preformatted strings', async () => {
    // The cell must stay numeric so Excel sorting and formulas keep working;
    // the "#,##0.00" number format is what makes it read as two decimals.
    await buildApp({ name: 'Widget', baseCost: '10.2273', priceListItems: [] });

    await request(app.getHttpServer()).get('/inventory/products/export').expect(200);

    expect(typeof exportedRow().baseCost).toBe('number');
  });
});
