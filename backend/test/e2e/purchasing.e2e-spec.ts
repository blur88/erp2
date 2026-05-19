import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import {
  truncateAll,
  seedAdmin,
  seedCategory,
  seedProduct,
  seedPaymentMethod,
  seedDocumentNumberSettings,
} from './helpers/seed';

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
    await truncateAll(dataSource);

    await seedAdmin(dataSource);
    const category = await seedCategory(dataSource);
    // Product starts at 0 stock — purchasing receives goods will add stock
    const product = await seedProduct(dataSource, category.id, { stockQuantity: 0, baseCost: 50 });
    productId = product.id;
    const pm = await seedPaymentMethod(dataSource);
    paymentMethodId = pm.id;
    await seedDocumentNumberSettings(dataSource);

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

      const supplier = res.body.data ?? res.body;
      expect(supplier).toHaveProperty('id');
      expect(supplier.companyName).toBe('Tech Supplies Ltd');
      supplierId = supplier.id;
      expect(supplierId).toBeTruthy();
    });

    it('GET /purchasing/suppliers — lists suppliers', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchasing/suppliers')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // SupplierListResponseDto: { suppliers: [...], total: N }
      const items: any[] = res.body.suppliers ?? res.body.data ?? res.body;
      expect(items.map((s: any) => s.id)).toContain(supplierId);
    });

    it('GET /purchasing/suppliers/:id — returns the supplier', async () => {
      const res = await request(app.getHttpServer())
        .get(`/purchasing/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect((res.body.data ?? res.body).id).toBe(supplierId);
    });

    it('PATCH /purchasing/suppliers/:id — updates the supplier', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/purchasing/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ companyName: 'Tech Supplies International', type: 'local' })
        .expect(200);

      expect((res.body.data ?? res.body).companyName).toBe('Tech Supplies International');
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

      expect((res.body.data ?? res.body).id).toBe(supplierId);
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

      expect((res.body.data ?? res.body).id).toBe(purchaseOrderId);
    });

    it('GET /purchasing/orders/summary — returns summary with expected fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchasing/orders/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalOrders');
      expect(res.body).toHaveProperty('totalAmount');
      expect(Number(res.body.totalOrders)).toBeGreaterThan(0);
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

      expect((res.body.data ?? res.body).notes).toBe('Updated notes');
    });
  });

  // ─── Goods received (stock impact) ────────────────────────────────────────

  describe('Goods received', () => {
    it('POST /purchasing/orders/:id/receive — receives goods', async () => {
      const res = await request(app.getHttpServer())
        .post(`/purchasing/orders/${purchaseOrderId}/receive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect((res.body.data ?? res.body)).toHaveProperty('id');
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

      expect(Number((res.body.data ?? res.body).paidAmount)).toBe(550);
    });

    it('GET /purchasing/orders/:id — paidAmount reflects the payment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/purchasing/orders/${purchaseOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Number((res.body.data ?? res.body).paidAmount)).toBe(550);
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
