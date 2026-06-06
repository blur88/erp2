import {
  ConflictException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AccountMappingController } from "../../src/modules/accounting/controllers/account-mapping.controller";
import { AccountMappingService } from "../../src/modules/accounting/services/account-mapping.service";
import { MappingType } from "../../src/database/entities/account-mapping.entity";
import { JwtAuthGuard } from "../../src/modules/auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../src/modules/auth/guards/roles.guard";

describe("AccountMappingController (e2e)", () => {
  let app: INestApplication;

  const mockAccountId = "123e4567-e89b-12d3-a456-426614174000";
  const mockMappingId = "223e4567-e89b-12d3-a456-426614174001";

  const mockMapping = {
    id: mockMappingId,
    mappingType: MappingType.SALES_REVENUE,
    accountId: mockAccountId,
    description: "Sales revenue account",
    isActive: true,
    account: {
      id: mockAccountId,
      code: "4000",
      name: "Sales Revenue",
      type: "REVENUE",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAccountMappingService = {
    findAll: jest.fn().mockResolvedValue({
      data: [mockMapping],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }),
    validateMappings: jest.fn().mockResolvedValue({
      isValid: true,
      missingMappings: [],
      configuredMappings: [MappingType.SALES_REVENUE],
      totalRequired: 1,
      totalConfigured: 1,
    }),
    findOne: jest.fn().mockResolvedValue(mockMapping),
    create: jest.fn().mockResolvedValue(mockMapping),
    update: jest
      .fn()
      .mockResolvedValue({
        ...mockMapping,
        description: "Updated description",
      }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AccountMappingController],
      providers: [
        {
          provide: AccountMappingService,
          useValue: mockAccountMappingService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/accounting/account-mappings", () => {
    it("should return paginated account mappings", () => {
      return request(app.getHttpServer())
        .get("/api/accounting/account-mappings")
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("data");
          expect(res.body).toHaveProperty("meta");
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it("should filter by mapping type", () => {
      return request(app.getHttpServer())
        .get("/api/accounting/account-mappings")
        .query({ mappingType: MappingType.SALES_REVENUE })
        .expect(200);
    });

    it("should filter by active status", () => {
      return request(app.getHttpServer())
        .get("/api/accounting/account-mappings")
        .query({ isActive: true })
        .expect(200);
    });
  });

  describe("GET /api/accounting/account-mappings/validate", () => {
    it("should return validation status", () => {
      return request(app.getHttpServer())
        .get("/api/accounting/account-mappings/validate")
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("isValid");
          expect(res.body).toHaveProperty("missingMappings");
          expect(res.body).toHaveProperty("configuredMappings");
          expect(res.body).toHaveProperty("totalRequired");
          expect(res.body).toHaveProperty("totalConfigured");
        });
    });
  });

  describe("GET /api/accounting/account-mappings/:id", () => {
    it("should return a single account mapping", () => {
      return request(app.getHttpServer())
        .get(`/api/accounting/account-mappings/${mockMappingId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("id");
          expect(res.body).toHaveProperty("mappingType");
          expect(res.body).toHaveProperty("accountId");
        });
    });

    it("should return 404 if mapping not found", () => {
      mockAccountMappingService.findOne.mockRejectedValueOnce(
        new NotFoundException("Account mapping with ID not found"),
      );

      return request(app.getHttpServer())
        .get("/api/accounting/account-mappings/non-existent-id")
        .expect(404);
    });
  });

  describe("POST /api/accounting/account-mappings", () => {
    it("should create a new account mapping", () => {
      const createDto = {
        mappingType: MappingType.SALES_AR,
        accountId: mockAccountId,
        description: "Accounts receivable account",
      };

      return request(app.getHttpServer())
        .post("/api/accounting/account-mappings")
        .send(createDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("id");
          expect(res.body).toHaveProperty("mappingType");
        });
    });

    it("should return 400 for invalid data", () => {
      return request(app.getHttpServer())
        .post("/api/accounting/account-mappings")
        .send({ mappingType: "invalid_type" })
        .expect(400);
    });

    it("should return 409 if mapping type already exists", () => {
      const createDto = {
        mappingType: MappingType.SALES_REVENUE,
        accountId: mockAccountId,
        description: "Duplicate mapping",
      };

      mockAccountMappingService.create.mockRejectedValueOnce(
        new ConflictException("Mapping type already exists"),
      );

      return request(app.getHttpServer())
        .post("/api/accounting/account-mappings")
        .send(createDto)
        .expect(409);
    });

    it("should return 404 if account not found", () => {
      const createDto = {
        mappingType: MappingType.SALES_COGS,
        accountId: "333e4567-e89b-12d3-a456-426614174999",
        description: "COGS account",
      };

      mockAccountMappingService.create.mockRejectedValueOnce(
        new NotFoundException("Account not found or inactive"),
      );

      return request(app.getHttpServer())
        .post("/api/accounting/account-mappings")
        .send(createDto)
        .expect(404);
    });
  });

  describe("PATCH /api/accounting/account-mappings/:id", () => {
    it("should update an account mapping", () => {
      const updateDto = {
        description: "Updated description",
      };

      return request(app.getHttpServer())
        .patch(`/api/accounting/account-mappings/${mockMappingId}`)
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("id");
          expect(res.body).toHaveProperty("description");
        });
    });

    it("should return 404 if mapping not found", () => {
      mockAccountMappingService.update.mockRejectedValueOnce(
        new NotFoundException("Account mapping with ID not found"),
      );

      return request(app.getHttpServer())
        .patch("/api/accounting/account-mappings/non-existent-id")
        .send({ description: "Updated" })
        .expect(404);
    });
  });

  describe("DELETE /api/accounting/account-mappings/:id", () => {
    it("should delete an account mapping", () => {
      return request(app.getHttpServer())
        .delete(`/api/accounting/account-mappings/${mockMappingId}`)
        .expect(204);
    });

    it("should return 404 if mapping not found", () => {
      mockAccountMappingService.remove.mockRejectedValueOnce(
        new NotFoundException("Account mapping with ID not found"),
      );

      return request(app.getHttpServer())
        .delete("/api/accounting/account-mappings/non-existent-id")
        .expect(404);
    });
  });
});
