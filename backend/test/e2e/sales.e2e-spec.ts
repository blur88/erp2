// backend/test/e2e/sales.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import { Category } from '../../src/database/entities/category.entity';
import { Product } from '../../src/database/entities/product.entity';
import { PaymentMethodEntity } from '../../src/database/entities/payment-method.entity';
import * as bcrypt from 'bcrypt';

describe('Sales (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let customerId: string;
  let productId: string;
  let salesOrderId: string;
  let salesOrderNumber: string;
  let paymentMethodId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    dataSource = app.get(DataSource);

    // Truncate all tables this spec touches (order matters for FK constraints)
    await dataSource.query(`
      TRUNCATE TABLE
        invoices,
        payments,
        sales_order_items,
        sales_orders,
        customers,
        stock_movements,
        stock_adjustments,
        price_list_items,
        products,
        categories,
        refresh_tokens,
        users
      RESTART IDENTITY CASCADE
    `);

    // Seed: admin user
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

    // Seed: category
    const categoryRepo = dataSource.getRepository(Category);
    const category = await categoryRepo.save(categoryRepo.create({ name: 'Test Category', level: 0 }));

    // Seed: product with stock
    const productRepo = dataSource.getRepository(Product);
    const product = await productRepo.save(productRepo.create({
      name: 'Test Product',
      categoryId: category.id,
      baseCost: 100,
      stockQuantity: 100,
      isActive: true,
    }));
    productId = product.id;

    // Seed: payment method (needed for recording payments)
    const pmRepo = dataSource.getRepository(PaymentMethodEntity);
    let pm = await pmRepo.findOne({ where: { code: 'CASH' } });
    if (!pm) {
      pm = await pmRepo.save(pmRepo.create({ code: 'CASH', name: 'Cash', requiresSettlement: false }));
    }
    paymentMethodId = pm.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ usernameOrEmail: 'admin', password: 'Admin@123!' });
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  // ─── Customer CRUD ────────────────────────────────────────────────────────

  describe('Customer CRUD', () => {
    it('POST /customers — creates a customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'business', name: 'Acme Corp' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Acme Corp');
      customerId = res.body.id;
    });

    it('GET /customers — lists customers', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const items = res.body.data ?? res.body;
      const ids = items.map((c: any) => c.id);
      expect(ids).toContain(customerId);
    });

    it('GET /customers/:id — returns the customer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${customerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(customerId);
      expect(res.body.name).toBe('Acme Corp');
    });

    it('PUT /customers/:id — updates the customer', async () => {
      const res = await request(app.getHttpServer())
        .put(`/customers/${customerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Acme Corporation Ltd' })
        .expect(200);

      expect(res.body.name).toBe('Acme Corporation Ltd');
    });

    it('DELETE /customers/:id — soft-deletes the customer', async () => {
      await request(app.getHttpServer())
        .delete(`/customers/${customerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('POST /customers/:id/restore — restores the customer', async () => {
      const res = await request(app.getHttpServer())
        .post(`/customers/${customerId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.id).toBe(customerId);
    });
  });
});
