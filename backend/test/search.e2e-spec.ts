import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { configureTestAppValidation } from "./utils/configure-test-app-validation";
import { DataSource, Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { AppModule } from "../src/app.module";
import {
  User,
  UserRole,
  UserStatus,
} from "../src/database/entities/user.entity";

describe("GET /search/global - role-based filtering (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepository: Repository<User>;

  const password = "Admin@123!";

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    userRepository = dataSource.getRepository(User);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      "TRUNCATE TABLE refresh_tokens, vendor_payments, purchase_order_items, purchase_orders, payments, sales_order_items, sales_orders, stock_adjustment_items, stock_adjustments, products, categories, customers, suppliers, users RESTART IDENTITY CASCADE",
    );

    await Promise.all(Object.values(UserRole).map((role) => createUser(role)));
  });

  async function createUser(role: UserRole): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = userRepository.create({
      username: `user_${role}`,
      email: `${role}@test.example`,
      password: hashedPassword,
      firstName: "Test",
      lastName: role,
      role,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    });

    return userRepository.save(user);
  }

  async function loginAs(role: UserRole): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        usernameOrEmail: `user_${role}`,
        password,
      })
      .expect(200);

    return response.body.accessToken as string;
  }

  async function searchAs(role: UserRole, q: string) {
    const token = await loginAs(role);
    return request(app.getHttpServer())
      .get(`/search/global?q=${encodeURIComponent(q)}`)
      .set("Authorization", `Bearer ${token}`);
  }

  it('Admin sees Audit Logs page when searching "audit"', async () => {
    const res = await searchAs(UserRole.ADMIN, "audit");

    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.route === "/audit-logs")).toBe(
      true,
    );
  });

  it('Sales Staff does not see Audit Logs page when searching "audit"', async () => {
    const res = await searchAs(UserRole.SALES_STAFF, "audit");

    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.route === "/audit-logs")).toBe(
      false,
    );
  });

  it('Sales Staff sees Customers page when searching "customer"', async () => {
    const res = await searchAs(UserRole.SALES_STAFF, "customer");

    expect(res.status).toBe(200);
    expect(
      res.body.results.some((r: any) => r.route === "/sales/customers"),
    ).toBe(true);
  });

  it('Inventory Staff does not see Customers page when searching "customer"', async () => {
    const res = await searchAs(UserRole.INVENTORY_STAFF, "customer");

    expect(res.status).toBe(200);
    expect(
      res.body.results.some((r: any) => r.route === "/sales/customers"),
    ).toBe(false);
  });

  it('Procurement Staff sees Purchasing pages when searching "purchase"', async () => {
    const res = await searchAs(UserRole.PROCUREMENT_STAFF, "purchase");

    expect(res.status).toBe(200);
    expect(
      res.body.results.some((r: any) => r.route?.startsWith("/purchasing")),
    ).toBe(true);
  });

  it('Inventory Staff does not see customer records when searching "test"', async () => {
    const res = await searchAs(UserRole.INVENTORY_STAFF, "test");

    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.type === "customer")).toBe(
      false,
    );
  });

  it('Sales Staff does not see purchase order records when searching "order"', async () => {
    const res = await searchAs(UserRole.SALES_STAFF, "order");

    expect(res.status).toBe(200);
    expect(
      res.body.results.some(
        (r: any) =>
          r.type === "transaction" &&
          r.route?.startsWith("/purchasing/orders/"),
      ),
    ).toBe(false);
  });

  it("all 5 roles can search products without authorization failures", async () => {
    for (const role of Object.values(UserRole)) {
      const res = await searchAs(role, "product");
      expect(res.status).toBe(200);
    }
  });

  it("returns 401 for unauthenticated request", async () => {
    const res = await request(app.getHttpServer()).get("/search/global?q=test");

    expect(res.status).toBe(401);
  });
});
