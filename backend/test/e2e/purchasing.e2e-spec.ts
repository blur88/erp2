// backend/test/e2e/purchasing.e2e-spec.ts
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

describe('Purchasing (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let supplierId: string;
  let productId: string;
  let paymentMethodId: string;
  let purchaseOrderId: string;
  let purchaseOrderNumber: string;

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
        vendor_payments,
        goods_received_note_items,
        goods_received_notes,
        purchase_order_items,
        purchase_orders,
        suppliers,
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
    await userRepo.save(
      userRepo.create({
        username: 'admin',
        email: 'admin@test.com',
        password: hashed,
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      }),
    );

    // Seed: category + product (zero stock)
    const categoryRepo = dataSource.getRepository(Category);
    const category = await categoryRepo.save(
      categoryRepo.create({ name: 'Test Category', level: 0 }),
    );

    const productRepo = dataSource.getRepository(Product);
    const product = await productRepo.save(
      productRepo.create({
        name: 'Test Product',
        categoryId: category.id,
        baseCost: 50,
        stockQuantity: 0,
        isActive: true,
      }),
    );
    productId = product.id;

    // Seed: payment method
    const pmRepo = dataSource.getRepository(PaymentMethodEntity);
    let pm = await pmRepo.findOne({ where: { code: 'CASH' } });
    if (!pm) {
      pm = await pmRepo.save(
        pmRepo.create({ code: 'CASH', name: 'Cash', requiresSettlement: false }),
      );
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

  // ─── Supplier CRUD ────────────────────────────────────────────────────────

  describe('Supplier CRUD', () => {
    it('POST /purchasing/suppliers — creates a supplier', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchasing/suppliers')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'local', companyName: 'Tech Supplies Ltd' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      const supplier = res.body.data ?? res.body;
      expect(supplier.companyName).toBe('Tech Supplies Ltd');
      supplierId = supplier.id;
      expect(supplierId).toBeTruthy();
    });

    it('GET /purchasing/suppliers — lists suppliers', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchasing/suppliers')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // SupplierListResponseDto returns { suppliers: [...], total: N }
      const items: any[] = res.body.suppliers ?? res.body.data ?? res.body;
      const ids = items.map((s: any) => s.id);
      expect(ids).toContain(supplierId);
    });

    it('GET /purchasing/suppliers/:id — returns the supplier', async () => {
      const res = await request(app.getHttpServer())
        .get(`/purchasing/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const supplier = res.body.data ?? res.body;
      expect(supplier.id).toBe(supplierId);
    });

    it('PATCH /purchasing/suppliers/:id — updates the supplier', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/purchasing/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ companyName: 'Tech Supplies International', type: 'local' })
        .expect(200);

      const supplier = res.body.data ?? res.body;
      expect(supplier.companyName).toBe('Tech Supplies International');
    });

    it('DELETE /purchasing/suppliers/:id — soft-deletes the supplier', async () => {
      await request(app.getHttpServer())
        .delete(`/purchasing/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('POST /purchasing/suppliers/:id/restore — restores the supplier', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchasing/suppliers/${supplierId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const supplier = res.body.data ?? res.body;
      expect(supplier.id).toBe(supplierId);
    });
  });
});
