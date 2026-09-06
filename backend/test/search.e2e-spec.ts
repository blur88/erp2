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
import {
  SEARCH_NS,
  SEARCH_TOKEN,
  SEARCH_CUSTOMER_NAME,
  SEARCH_SUPPLIER_NAME,
  resetSearchFixtures,
} from "./utils/search-fixture";

describe("GET /search/global - role-based filtering (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepository: Repository<User>;

  const password = "Admin@123!";

  // Suite-owned fixture ids, so assertions can name the exact row they mean
  // instead of asserting over whatever else happens to be in the shared DB.
  let customerId: string;
  let supplierId: string;
  let purchaseOrderId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    userRepository = dataSource.getRepository(User);

    // Own-rows reset before seeding, so a previous interrupted run cannot leave
    // duplicates behind. This suite no longer truncates the shared database
    // (issue #1199).
    await resetSearchFixtures(dataSource);
    await Promise.all(Object.values(UserRole).map((role) => createUser(role)));
    await seedBusinessFixtures();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await resetSearchFixtures(dataSource);
      await dataSource.destroy();
    }
    await app.close();
  });

  async function createUser(role: UserRole): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = userRepository.create({
      username: `${SEARCH_NS}_${role}`,
      email: `${SEARCH_NS}_${role}@test.example`,
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

  /**
   * Seeds one customer and one purchase order this suite owns.
   *
   * These exist so the role-restriction assertions below are meaningful. Under
   * the old global TRUNCATE there were no customers or purchase orders at all,
   * so "restricted role sees no customer results" passed vacuously — it would
   * have passed just as well against a broken permission check.
   */
  async function seedBusinessFixtures(): Promise<void> {
    const [customer] = await dataSource.query(
      `INSERT INTO customers ("name", "slug", "type")
       VALUES ($1, $2, 'individual') RETURNING id`,
      [
        SEARCH_CUSTOMER_NAME,
        `${SEARCH_TOKEN.toLowerCase()}-${SEARCH_NS}-trading`,
      ],
    );
    customerId = customer.id;

    const [supplier] = await dataSource.query(
      `INSERT INTO suppliers ("companyName", "slug", "type")
       VALUES ($1, $2, 'local') RETURNING id`,
      [
        SEARCH_SUPPLIER_NAME,
        `${SEARCH_TOKEN.toLowerCase()}-${SEARCH_NS}-supply`,
      ],
    );
    supplierId = supplier.id;

    // The PO is reachable by SEARCH_TOKEN through the supplier.companyName join
    // (purchase-order.service.ts searchGlobal matches
    // `order.orderNumber ILIKE :q OR supplier.companyName ILIKE :q`).
    // Reachability comes from that join and the token's global uniqueness — NOT
    // from prefix scoring, which mapPurchaseOrder computes on orderNumber only.
    // orderDate is a `date` column: a YYYY-MM-DD string, per the calendar-date
    // contract.
    const [order] = await dataSource.query(
      `INSERT INTO purchase_orders
         ("orderNumber", "orderDate", "supplierId", "subtotal", "totalAmount")
       VALUES ($1, '2026-01-15', $2, 0, 0) RETURNING id`,
      [`PO-2091-${SEARCH_NS.toUpperCase().slice(0, 6)}1`, supplierId],
    );
    purchaseOrderId = order.id;
  }

  async function loginAs(role: UserRole): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        usernameOrEmail: `${SEARCH_NS}_${role}`,
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

  // The two tests below are a pair. The positive half proves the fixture is
  // present and reachable for an authorized role; only then does the negative
  // half mean anything. Both halves use the SAME query, so the only variable
  // between them is the caller's role.

  it("Sales Staff finds the suite's own customer record by its token", async () => {
    const res = await searchAs(UserRole.SALES_STAFF, SEARCH_TOKEN);

    expect(res.status).toBe(200);
    expect(
      res.body.results.some(
        (r: any) => r.type === "customer" && r.id === customerId,
      ),
    ).toBe(true);
  });

  it("Inventory Staff does not see the suite's own customer record", async () => {
    const res = await searchAs(UserRole.INVENTORY_STAFF, SEARCH_TOKEN);

    expect(res.status).toBe(200);
    // Allow-listed to the row this suite owns. Asserting "no customer results
    // at all" would depend on the rest of the shared database being empty.
    expect(
      res.body.results.some(
        (r: any) => r.type === "customer" && r.id === customerId,
      ),
    ).toBe(false);
  });

  it("Procurement Staff finds the suite's own purchase order by its supplier token", async () => {
    const res = await searchAs(UserRole.PROCUREMENT_STAFF, SEARCH_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.id === purchaseOrderId)).toBe(
      true,
    );
  });

  it("Sales Staff does not see the suite's own purchase order record", async () => {
    const res = await searchAs(UserRole.SALES_STAFF, SEARCH_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.id === purchaseOrderId)).toBe(
      false,
    );
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
