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

    // Seed: document number settings (required for PO, GRN, and vendor payment numbering)
    const currentYY = new Date().getFullYear() % 100;
    const docConfigs = [
      { documentName: 'Purchase Orders', prefix: 'PO' },
      { documentName: 'Goods Received', prefix: 'GRN' },
      { documentName: 'Vendor Payments', prefix: 'VP' },
    ];
    for (const cfg of docConfigs) {
      await dataSource.query(
        `INSERT INTO document_number_settings ("documentName", prefix, "paddingDigits", "nextNumber", "lastResetYear")
         VALUES ($1, $2, 3, 1, $3)
         ON CONFLICT ("documentName") DO NOTHING`,
        [cfg.documentName, cfg.prefix, currentYY],
      );
    }

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

  // ─── Purchase Order Lifecycle ─────────────────────────────────────────────

  describe('Purchase order lifecycle', () => {
    it('POST /purchasing/orders — creates a purchase order', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchasing/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          supplierId,
          orderDate: new Date().toISOString().split('T')[0],
          items: [{ productId, quantity: 10, unitPrice: 55 }],
        })
        .expect(201);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('orderNumber');
      purchaseOrderId = res.body.data.id;
      purchaseOrderNumber = res.body.data.orderNumber;
      expect(purchaseOrderId).toBeTruthy();
    });

    it('GET /purchasing/orders/:id — returns the purchase order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/purchasing/orders/${purchaseOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const po = res.body.data ?? res.body;
      expect(po.id).toBe(purchaseOrderId);
      expect(po.supplier?.id ?? po.supplierId).toBe(supplierId);
    });

    it('GET /purchasing/orders/by-number/:orderNumber — returns by order number', async () => {
      const res = await request(app.getHttpServer())
        .get(`/purchasing/orders/by-number/${purchaseOrderNumber}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const po = res.body.data ?? res.body;
      expect(po.id).toBe(purchaseOrderId);
    });

    it('GET /purchasing/orders/summary — returns summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchasing/orders/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('PUT /purchasing/orders/:id — updates the purchase order notes', async () => {
      const res = await request(app.getHttpServer())
        .put(`/purchasing/orders/${purchaseOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          supplierId,
          orderDate: new Date().toISOString().split('T')[0],
          notes: 'Updated notes',
          items: [{ productId, quantity: 10, unitPrice: 55 }],
        })
        .expect(200);

      const po = res.body.data ?? res.body;
      expect(po.notes).toBe('Updated notes');
    });
  });

  // ─── Goods received (stock impact) ────────────────────────────────────────

  describe('Goods received', () => {
    it('POST /purchasing/orders/:id/receive — receives goods', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchasing/orders/${purchaseOrderId}/receive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data ?? res.body).toBeDefined();
    });

    it('GET /inventory/products/:id — stock increased after receiving goods', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Product started at 0 stock; received 10 units
      expect(Number(res.body.stockQuantity)).toBe(10);
    });
  });

  // ─── Vendor payment ───────────────────────────────────────────────────────

  describe('Vendor payment', () => {
    it('POST /purchasing/orders/:id/record-payment — records a payment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchasing/orders/${purchaseOrderId}/record-payment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 550 })
        .expect(200);

      const po = res.body.data ?? res.body;
      expect(Number(po.paidAmount)).toBeGreaterThan(0);
    });

    it('GET /purchasing/orders/:id — paidAmount reflects the payment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/purchasing/orders/${purchaseOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const po = res.body.data ?? res.body;
      expect(Number(po.paidAmount)).toBeGreaterThanOrEqual(550);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('POST /purchasing/orders/:id/receive — non-existent PO returns 404', async () => {
      await request(app.getHttpServer())
        .post('/purchasing/orders/00000000-0000-0000-0000-000000000000/receive')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('POST /purchasing/orders — unknown supplierId returns 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchasing/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          supplierId: '00000000-0000-0000-0000-000000000000',
          orderDate: new Date().toISOString().split('T')[0],
          items: [{ productId, quantity: 1, unitPrice: 10 }],
        })
        .expect(404);

      expect(res.body.message).toBeDefined();
    });
  });
});
