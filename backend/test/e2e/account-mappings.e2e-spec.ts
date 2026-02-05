import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountingModule } from '../../src/modules/accounting/accounting.module';
import { AccountMapping, MappingType } from '../../src/database/entities/account-mapping.entity';
import { ChartOfAccount } from '../../src/database/entities/chart-of-account.entity';
import { FiscalPeriod } from '../../src/database/entities/fiscal-period.entity';
import { JournalEntry } from '../../src/database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../src/database/entities/journal-entry-line.entity';

describe('AccountMappingController (e2e)', () => {
  let app: INestApplication;

  const mockAccountId = '123e4567-e89b-12d3-a456-426614174000';
  const mockMappingId = '223e4567-e89b-12d3-a456-426614174001';

  const mockAccount = {
    id: mockAccountId,
    code: '4000',
    name: 'Sales Revenue',
    type: 'REVENUE',
    isActive: true,
  };

  const mockMapping = {
    id: mockMappingId,
    mappingType: MappingType.SALES_REVENUE,
    accountId: mockAccountId,
    description: 'Sales revenue account',
    isActive: true,
    account: mockAccount,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMappingRepository = {
    find: jest.fn().mockResolvedValue([mockMapping]),
    findOne: jest.fn().mockResolvedValue(mockMapping),
    save: jest.fn().mockResolvedValue(mockMapping),
    create: jest.fn().mockReturnValue(mockMapping),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockMapping], 1]),
    })),
  };

  const mockAccountRepository = {
    findOne: jest.fn().mockResolvedValue(mockAccount),
    find: jest.fn().mockResolvedValue([mockAccount]),
  };

  // Mock other repositories needed by AccountingModule
  const mockFiscalPeriodRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };

  const mockJournalEntryRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };

  const mockJournalEntryLineRepository = {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AccountingModule],
    })
      .overrideProvider(getRepositoryToken(AccountMapping))
      .useValue(mockMappingRepository)
      .overrideProvider(getRepositoryToken(ChartOfAccount))
      .useValue(mockAccountRepository)
      .overrideProvider(getRepositoryToken(FiscalPeriod))
      .useValue(mockFiscalPeriodRepository)
      .overrideProvider(getRepositoryToken(JournalEntry))
      .useValue(mockJournalEntryRepository)
      .overrideProvider(getRepositoryToken(JournalEntryLine))
      .useValue(mockJournalEntryLineRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/accounting/account-mappings', () => {
    it('should return paginated account mappings', () => {
      return request(app.getHttpServer())
        .get('/api/accounting/account-mappings')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should filter by mapping type', () => {
      return request(app.getHttpServer())
        .get('/api/accounting/account-mappings')
        .query({ mappingType: MappingType.SALES_REVENUE })
        .expect(200);
    });

    it('should filter by active status', () => {
      return request(app.getHttpServer())
        .get('/api/accounting/account-mappings')
        .query({ isActive: true })
        .expect(200);
    });
  });

  describe('GET /api/accounting/account-mappings/validate', () => {
    it('should return validation status', () => {
      return request(app.getHttpServer())
        .get('/api/accounting/account-mappings/validate')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('isValid');
          expect(res.body).toHaveProperty('missingMappings');
          expect(res.body).toHaveProperty('configuredMappings');
          expect(res.body).toHaveProperty('totalRequired');
          expect(res.body).toHaveProperty('totalConfigured');
        });
    });
  });

  describe('GET /api/accounting/account-mappings/:id', () => {
    it('should return a single account mapping', () => {
      return request(app.getHttpServer())
        .get(`/api/accounting/account-mappings/${mockMappingId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('mappingType');
          expect(res.body).toHaveProperty('accountId');
        });
    });

    it('should return 404 if mapping not found', () => {
      mockMappingRepository.findOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .get('/api/accounting/account-mappings/non-existent-id')
        .expect(404);
    });
  });

  describe('POST /api/accounting/account-mappings', () => {
    it('should create a new account mapping', () => {
      const createDto = {
        mappingType: MappingType.SALES_AR,
        accountId: mockAccountId,
        description: 'Accounts receivable account',
      };

      mockMappingRepository.findOne.mockResolvedValueOnce(null); // No existing mapping
      mockMappingRepository.findOne.mockResolvedValueOnce(mockMapping); // Reload with relations

      return request(app.getHttpServer())
        .post('/api/accounting/account-mappings')
        .send(createDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('mappingType');
        });
    });

    it('should return 400 for invalid data', () => {
      return request(app.getHttpServer())
        .post('/api/accounting/account-mappings')
        .send({ mappingType: 'invalid_type' })
        .expect(400);
    });

    it('should return 409 if mapping type already exists', () => {
      const createDto = {
        mappingType: MappingType.SALES_REVENUE,
        accountId: mockAccountId,
        description: 'Duplicate mapping',
      };

      mockMappingRepository.findOne.mockResolvedValueOnce(mockMapping); // Existing mapping

      return request(app.getHttpServer())
        .post('/api/accounting/account-mappings')
        .send(createDto)
        .expect(409);
    });

    it('should return 404 if account not found', () => {
      const createDto = {
        mappingType: MappingType.SALES_COGS,
        accountId: 'non-existent-account',
        description: 'COGS account',
      };

      mockMappingRepository.findOne.mockResolvedValueOnce(null);
      mockAccountRepository.findOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .post('/api/accounting/account-mappings')
        .send(createDto)
        .expect(404);
    });
  });

  describe('PATCH /api/accounting/account-mappings/:id', () => {
    it('should update an account mapping', () => {
      const updateDto = {
        description: 'Updated description',
      };

      mockMappingRepository.findOne.mockResolvedValueOnce(mockMapping);
      mockMappingRepository.findOne.mockResolvedValueOnce({
        ...mockMapping,
        ...updateDto,
      });

      return request(app.getHttpServer())
        .patch(`/api/accounting/account-mappings/${mockMappingId}`)
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('description');
        });
    });

    it('should return 404 if mapping not found', () => {
      mockMappingRepository.findOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .patch('/api/accounting/account-mappings/non-existent-id')
        .send({ description: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api/accounting/account-mappings/:id', () => {
    it('should delete an account mapping', () => {
      return request(app.getHttpServer())
        .delete(`/api/accounting/account-mappings/${mockMappingId}`)
        .expect(204);
    });

    it('should return 404 if mapping not found', () => {
      mockMappingRepository.findOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .delete('/api/accounting/account-mappings/non-existent-id')
        .expect(404);
    });
  });
});
