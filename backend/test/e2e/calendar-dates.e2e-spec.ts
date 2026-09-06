import { jest } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { RegionalSettings } from "../../src/database/entities/regional-settings.entity";
import {
  E2E_ADMIN_USERNAMES,
  E2E_ADMIN_PASSWORD,
  seedSuiteAdmin,
  removeSuiteAdmin,
} from "../utils/shared-e2e-fixture";
import { resetSuiteBusinessRows } from "../utils/shared-e2e-business-fixture";
import { configureTestAppValidation } from "../utils/configure-test-app-validation";

let app: INestApplication;
let dataSource: DataSource;
let accessToken: string;
let productId: string;
let savedRegionalTz: string | null = null;
// Roots this suite owns, for own-rows cleanup (issue #1199).
let categoryId: string;
let createdRegional: RegionalSettings | null = null;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  dataSource = app.get(DataSource);

  // Suite-owned admin. Previously truncateAll() + seedAdmin("admin") plus a
  // global price_lists truncate, which destroyed other suites' fixtures
  // (issue #1199).
  await seedSuiteAdmin(dataSource, E2E_ADMIN_USERNAMES.calendarDates);

  const [{ TimeZone }] = await dataSource.query("SHOW TIME ZONE");
  expect(TimeZone).toBe("America/Los_Angeles");

  const rsRepo = dataSource.getRepository(RegionalSettings);
  const active = await rsRepo.findOne({ where: { isActive: true } });
  savedRegionalTz = active ? active.timezone : null;
  if (active) {
    active.timezone = "Asia/Kuala_Lumpur";
    await rsRepo.save(active);
  } else {
    const entity = rsRepo.create({
      timezone: "Asia/Kuala_Lumpur",
      isActive: true,
    } as Partial<RegionalSettings>);
    createdRegional = await rsRepo.save(entity);
  }

  const login = await request(app.getHttpServer())
    .post("/auth/login")
    .send({
      usernameOrEmail: E2E_ADMIN_USERNAMES.calendarDates,
      password: E2E_ADMIN_PASSWORD,
    })
    .expect(200);
  accessToken = login.body.accessToken;

  const cat = await request(app.getHttpServer())
    .post("/inventory/categories")
    .set(auth())
    .send({ name: `cal-dates-${Date.now()}` })
    .expect(201);
  categoryId = cat.body.id;
  const prod = await request(app.getHttpServer())
    .post("/inventory/products")
    .set(auth())
    .send({
      name: "Cal Date Product",
      categoryId: cat.body.id,
      baseCost: 100,
      stockQuantity: 0,
    })
    .expect(201);
  productId = prod.body.id;
});

afterAll(async () => {
  if (dataSource?.isInitialized) {
    await resetSuiteBusinessRows(dataSource, {
      categoryIds: categoryId ? [categoryId] : [],
    });
    await removeSuiteAdmin(dataSource, E2E_ADMIN_USERNAMES.calendarDates);
    const rsRepo = dataSource.getRepository(RegionalSettings);
    if (createdRegional) {
      await rsRepo.delete({ id: createdRegional.id } as any);
    } else if (savedRegionalTz !== null) {
      const active = await rsRepo.findOne({ where: { isActive: true } });
      if (active) {
        active.timezone = savedRegionalTz;
        await rsRepo.save(active);
      }
    }
  }
  await app?.close();
});

function auth() {
  return { Authorization: `Bearer ${accessToken}` };
}

describe("calendar-date round-trip (DataSource-backed)", () => {
  it("POST/GET stock adjustment preserves YYYY-MM-DD adjustmentDate string", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/stock-adjustments")
      .set(auth())
      .send({
        adjustmentDate: "2026-07-20",
        items: [{ productId, oldQuantity: 0, newQuantity: 1, difference: 1 }],
      })
      .expect(201);
    expect(res.body.adjustmentDate).toBe("2026-07-20");

    const getRes = await request(app.getHttpServer())
      .get(`/inventory/stock-adjustments/${res.body.id}`)
      .set(auth())
      .expect(200);
    expect(getRes.body.adjustmentDate).toBe("2026-07-20");
  });

  it("POST/GET price list preserves YYYY-MM-DD effectiveFrom string", async () => {
    const res = await request(app.getHttpServer())
      .post("/price-lists")
      .set(auth())
      .send({
        code: `RT-${Date.now()}`,
        name: "Round Trip",
        effectiveFrom: "2026-07-20",
      })
      .expect(201);
    expect(res.body.effectiveFrom).toBe("2026-07-20");

    const getRes = await request(app.getHttpServer())
      .get(`/price-lists/${res.body.id}`)
      .set(auth())
      .expect(200);
    expect(getRes.body.effectiveFrom).toBe("2026-07-20");
  });
});

describe("calendar-date effective-list boundary (app-tz)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns a price list effective through today (app-tz, last-day inclusive)", async () => {
    jest.useFakeTimers({
      now: new Date("2026-07-19T17:00:00.000Z"),
      doNotFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "nextTick",
        "queueMicrotask",
      ],
    });
    const SEEDED_CODE = `EFF-${Date.now()}`;
    await request(app.getHttpServer())
      .post("/price-lists")
      .set(auth())
      .send({
        code: SEEDED_CODE,
        name: "Effective today",
        effectiveTo: "2026-07-20",
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/price-lists/effective")
      .set(auth())
      .expect(200);
    expect(res.body.map((p: any) => p.code)).toContain(SEEDED_CODE);
  });
});

describe("calendar-date inclusive filter boundary (real DB)", () => {
  it("filters stock adjustments inclusively on both date bounds", async () => {
    const ids: Record<string, string> = {};
    for (const d of ["2026-06-30", "2026-07-01", "2026-07-31", "2026-08-01"]) {
      const r = await request(app.getHttpServer())
        .post("/inventory/stock-adjustments")
        .set(auth())
        .send({
          adjustmentDate: d,
          items: [{ productId, oldQuantity: 0, newQuantity: 1, difference: 1 }],
        })
        .expect(201);
      ids[d] = r.body.id;
    }
    const res = await request(app.getHttpServer())
      .get("/inventory/stock-adjustments?fromDate=2026-07-01&toDate=2026-07-31")
      .set(auth())
      .expect(200);
    const returnedIds = res.body.data.map((a: any) => a.id);
    expect(returnedIds).toContain(ids["2026-07-01"]);
    expect(returnedIds).toContain(ids["2026-07-31"]);
    expect(returnedIds).not.toContain(ids["2026-06-30"]);
    expect(returnedIds).not.toContain(ids["2026-08-01"]);
  });
});
