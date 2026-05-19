// backend/test/e2e/inventory.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    dataSource = app.get(DataSource);

    // Truncate all tables this spec touches
    await dataSource.query(`
      TRUNCATE TABLE
        stock_movements,
        stock_adjustments,
        price_list_items,
        products,
        categories,
        refresh_tokens,
        users
      RESTART IDENTITY CASCADE
    `);

    // Seed admin user and get token
    const userRepo = dataSource.getRepository(User);
    const hashed = await bcrypt.hash('Admin@123!', 12);
    await userRepo.save(userRepo.create({
      username: 'admin',
      email: 'admin@test.com',
      password: hashed,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    }));

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ usernameOrEmail: 'admin', password: 'Admin@123!' });
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  // ─── Category CRUD ────────────────────────────────────────────────────────

  describe('Category CRUD', () => {
    it('POST /inventory/categories — creates a category', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Electronics' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Electronics');
      categoryId = res.body.id;
    });

    it('GET /inventory/categories — lists categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids = (res.body.data ?? res.body).map((c: any) => c.id);
      expect(ids).toContain(categoryId);
    });

    it('GET /inventory/categories/:id — returns the category', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/categories/${categoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(categoryId);
      expect(res.body.name).toBe('Electronics');
    });

    it('PATCH /inventory/categories/:id — updates the category name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inventory/categories/${categoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Consumer Electronics' })
        .expect(200);

      expect(res.body.name).toBe('Consumer Electronics');
    });

    it('DELETE /inventory/categories/:id — soft-deletes the category', async () => {
      await request(app.getHttpServer())
        .delete(`/inventory/categories/${categoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('POST /inventory/categories/:id/restore — restores the category', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/categories/${categoryId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.id).toBe(categoryId);
    });
  });
});
