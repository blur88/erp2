import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';

describe('Required field validation (e2e) — #973', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let productId: string;
  let adjustmentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // --- auth fixture ---
    const username = `req-val-admin-${Date.now()}`;
    const userRepository = dataSource.getRepository(User);
    await userRepository.save(
      userRepository.create({
        username,
        email: `${username}@test.com`,
        password: await bcrypt.hash('Admin@123!', 12),
        firstName: 'Req',
        lastName: 'Val',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      }),
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'Admin@123!' });
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();

    // --- inventory fixture: category + product (raw SQL, per existing e2e suites) ---
    const categoryId = randomUUID();
    await dataSource.query(
      `INSERT INTO categories (id, name, slug, "isActive")
       VALUES ($1, 'ReqVal Cat ${categoryId}', 'reqval-cat-${categoryId}', true)`,
      [categoryId],
    );

    productId = randomUUID();
    await dataSource.query(
      `INSERT INTO products (id, name, slug, type, "categoryId", "baseCost", "stockQuantity", "isActive")
       VALUES ($1, 'ReqVal Product ${productId}', 'reqval-product-${productId}', 'Stocked Product', $2, 5, 10, true)`,
      [productId, categoryId],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  describe('empty body returns 400, not 500', () => {
    it.each([
      ['/inventory/products'],
      ['/sales-orders'],
      ['/inventory/stock/movements'],
      ['/accounting/expenses'],
    ])('POST %s with {} returns 400', async (route) => {
      const response = await request(app.getHttpServer())
        .post(route)
        .set(auth())
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Validation failed');
    });
  });

  describe('expense amount grammar (#1001)', () => {
    const validExpense = () => ({
      expenseDate: '2026-07-15',
      description: 'Amount grammar probe',
      expenseAccountId: randomUUID(),
      totalAmount: '1000.00',
    });

    it.each([
      ['1000.'],
      ['1e3'],
      ['.5'],
      ['+1000'],
      ['-5'],
      ['1.00000'],
      [' 1000 '],
    ])('POST /accounting/expenses rejects totalAmount %j', async (totalAmount) => {
      const response = await request(app.getHttpServer())
        .post('/accounting/expenses')
        .set(auth())
        .send({ ...validExpense(), totalAmount });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Validation failed');
    });
  });

  describe('explicit null on a required property', () => {
    it('POST /inventory/products with null name returns 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/inventory/products')
        .set(auth())
        .send({ name: null, categoryId: null, baseCost: null });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Validation failed');
    });
  });

  describe('required query input', () => {
    it('GET /search/global without q returns 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/search/global')
        .set(auth());

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Validation failed');
    });

    it('GET /search/global with a valid q is accepted', async () => {
      const response = await request(app.getHttpServer())
        .get('/search/global')
        .query({ q: 'widget' })
        .set(auth());

      expect(response.status).toBe(200);
    });
  });

  describe('nested DTO under an update container', () => {
    beforeAll(async () => {
      // A valid adjustment needs at least one complete item.
      const created = await request(app.getHttpServer())
        .post('/inventory/stock-adjustments')
        .set(auth())
        .send({
          adjustmentDate: '2026-07-20',
          items: [
            { productId, oldQuantity: 10, newQuantity: 12, difference: 2 },
          ],
        });

      expect(created.status).toBe(201);
      adjustmentId = created.body?.data?.id ?? created.body?.id;
      expect(adjustmentId).toBeTruthy();
    });

    it('PUT with no items is accepted — the container stays permissive', async () => {
      const response = await request(app.getHttpServer())
        .put(`/inventory/stock-adjustments/${adjustmentId}`)
        .set(auth())
        .send({ notes: 'updated without items' });

      expect(response.status).toBe(200);
    });

    it('PUT with a complete nested item is accepted', async () => {
      const response = await request(app.getHttpServer())
        .put(`/inventory/stock-adjustments/${adjustmentId}`)
        .set(auth())
        .send({
          items: [
            { productId, oldQuantity: 10, newQuantity: 15, difference: 5 },
          ],
        });

      expect(response.status).toBe(200);
    });

    it('PUT with an incomplete nested item returns 400', async () => {
      const response = await request(app.getHttpServer())
        .put(`/inventory/stock-adjustments/${adjustmentId}`)
        .set(auth())
        .send({ items: [{ productId }] });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Validation failed');
    });
  });
});
