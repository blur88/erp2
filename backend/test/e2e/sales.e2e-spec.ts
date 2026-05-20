import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { truncateAll, seedAdmin, seedCategory, seedProduct, seedPaymentMethod } from './helpers/seed';

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
    await truncateAll(dataSource);

    await seedAdmin(dataSource);
    const category = await seedCategory(dataSource);
    const product = await seedProduct(dataSource, category.id, { stockQuantity: 100, baseCost: 100 });
    productId = product.id;
    const pm = await seedPaymentMethod(dataSource);
    paymentMethodId = pm.id;

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

      const items: any[] = res.body.data ?? res.body;
      expect(items.map((c: any) => c.id)).toContain(customerId);
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

  // ─── Sales Order Lifecycle ────────────────────────────────────────────────

  describe('Sales order lifecycle', () => {
    it('POST /sales-orders — creates a sales order', async () => {
      const res = await request(app.getHttpServer())
        .post('/sales-orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          customerId,
          items: [{ productId, quantity: 2, unitPrice: 150 }],
        })
        .expect(201);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('orderNumber');
      salesOrderId = res.body.data.id;
      salesOrderNumber = res.body.data.orderNumber;
    });

    it('GET /sales-orders/:id — returns the sales order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sales-orders/${salesOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(salesOrderId);
      expect(res.body.customerId).toBe(customerId);
    });

    it('GET /sales-orders/number/:orderNumber — returns by order number', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sales-orders/number/${salesOrderNumber}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(salesOrderId);
    });

    it('GET /sales-orders/:id/fulfillment-status — returns fulfillment status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sales-orders/${salesOrderId}/fulfillment-status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('orderId', salesOrderId);
      expect(res.body).toHaveProperty('totalItems');
    });

    it('PUT /sales-orders/:id — updates the sales order notes', async () => {
      const res = await request(app.getHttpServer())
        .put(`/sales-orders/${salesOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          customerId,
          notes: 'Handle with care',
          items: [{ productId, quantity: 2, unitPrice: 150 }],
        })
        .expect(200);

      const order = res.body.data ?? res.body;
      expect(order.notes).toBe('Handle with care');
    });

    it('POST /sales-orders/:id/duplicate — duplicates the order', async () => {
      const res = await request(app.getHttpServer())
        .post(`/sales-orders/${salesOrderId}/duplicate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const order = res.body.data ?? res.body;
      expect(order).toHaveProperty('id');
    });
  });

  // ─── Payment flow ─────────────────────────────────────────────────────────

  describe('Payment flow', () => {
    it('POST /sales-orders/:id/record-payment — records a payment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/sales-orders/${salesOrderId}/record-payment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 300, paymentMethodId })
        .expect(201);

      const order = res.body.data ?? res.body;
      expect(Number(order.paidAmount)).toBe(300);
    });

    it('GET /sales-orders/:id — paidAmount reflects the payment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sales-orders/${salesOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Number(res.body.paidAmount)).toBe(300);
    });
  });

  // ─── Invoice ──────────────────────────────────────────────────────────────
  describe('Invoice', () => {
    it('POST /sales-orders/:id/create-invoice — creates an invoice', async () => {
      const res = await request(app.getHttpServer())
        .post(`/sales-orders/${salesOrderId}/create-invoice`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body).toHaveProperty('invoiceId');
      expect(res.body).toHaveProperty('invoiceNumber');
    });

    it('GET /sales-orders/:id/invoices — lists invoices for the order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sales-orders/${salesOrderId}/invoices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('invoices');
      expect(res.body.invoices.length).toBeGreaterThan(0);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('POST /sales-orders — non-existent product returns 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/sales-orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          customerId,
          items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitPrice: 150 }],
        })
        .expect(404);

      expect(res.body.message).toBeDefined();
    });
  });
});
