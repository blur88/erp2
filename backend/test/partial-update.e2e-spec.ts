import {
  Body,
  Controller,
  Get,
  INestApplication,
  Param,
  Patch,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, FindOptionsWhere } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BaseCrudService } from '../src/common/services/base-crud.service';
import { Category } from '../src/database/entities/category.entity';
import { AuditLogService } from '../src/modules/audit-logs/services';
import { Public } from '../src/modules/auth/decorators/public.decorator';
import {
  CreateCategoryDto,
  QueryCategoriesDto,
  UpdateCategoryDto,
} from '../src/modules/inventory/dto/category.dto';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

// Concrete services override update(). This test adapter exercises the inherited
// BaseCrudService implementation with a real DTO and PostgreSQL repository (#1922).
class PartialUpdateCategoryService extends BaseCrudService<
  Category,
  CreateCategoryDto,
  UpdateCategoryDto,
  QueryCategoriesDto
> {
  getEntityType(): string {
    return 'Category';
  }

  buildWhereClause(): FindOptionsWhere<Category> {
    return {};
  }
}

@Public()
@Controller('partial-update-categories')
class PartialUpdateCategoryController {
  constructor(private readonly service: PartialUpdateCategoryService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(id, dto, 'system');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}

describe('BaseCrudService partial HTTP updates (#1922)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let categoryId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PartialUpdateCategoryController],
      providers: [
        {
          provide: PartialUpdateCategoryService,
          inject: [DataSource, AuditLogService],
          useFactory: (source: DataSource, audit: AuditLogService) =>
            new PartialUpdateCategoryService(
              source.getRepository(Category),
              audit,
            ),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    try {
      if (dataSource?.isInitialized && categoryId) {
        await removeSuiteTraces(dataSource, { entityIds: [categoryId] });
        await dataSource.getRepository(Category).delete(categoryId);
      }
    } finally {
      await app?.close();
    }
  });

  it('preserves omitted fields in the PATCH response and on HTTP reread', async () => {
    const repository = dataSource.getRepository(Category);
    const category = await repository.save(
      repository.create({
        name: `Partial update ${Date.now()}`,
        description: 'Original description',
        level: 0,
      }),
    );
    categoryId = category.id;
    const expected = {
      id: categoryId,
      name: category.name,
      slug: category.slug,
      description: 'Updated description',
      level: 0,
      isEnabled: true,
    };

    const updated = await request(app.getHttpServer())
      .patch(`/partial-update-categories/${categoryId}`)
      .send({ description: 'Updated description' })
      .expect(200);
    expect(updated.body).toMatchObject(expected);

    const reread = await request(app.getHttpServer())
      .get(`/partial-update-categories/${categoryId}`)
      .expect(200);
    expect(reread.body).toMatchObject(expected);
  });
});
