import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { ExportService } from "../../../common/services/export.service";
import { PricingService } from "../services/pricing.service";
import { ProductService } from "../services/product.service";
import { ProductController } from "./product.controller";

const mockProductService = {
  findAll: jest.fn().mockResolvedValue({
    data: [
      {
        sku: "P001",
        name: "Widget",
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
  exportFlat: jest.fn().mockResolvedValue(Buffer.from("fake-excel")),
};

describe("ProductController /export", () => {
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

  it("GET /inventory/products/export returns 200 with xlsx content-type", async () => {
    const res = await request(app.getHttpServer()).get(
      "/inventory/products/export",
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});
