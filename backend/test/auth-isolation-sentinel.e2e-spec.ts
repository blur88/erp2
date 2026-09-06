import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { DataSource } from "typeorm";
import request from "supertest";
import * as bcrypt from "bcrypt";
import {
  User,
  UserRole,
  UserStatus,
} from "../src/database/entities/user.entity";
import { RefreshToken } from "../src/database/entities/refresh-token.entity";
import { configureTestAppValidation } from "./utils/configure-test-app-validation";
import { AUTH_USERNAMES, resetAuthFixtureUsers } from "./utils/auth-fixture";
import {
  SEARCH_USERNAMES,
  SEARCH_NAME_PREFIX,
  resetSearchFixtures,
} from "./utils/search-fixture";
import {
  FUZZY_NAME_PREFIX,
  resetFuzzySearchFixtures,
} from "./utils/fuzzy-search-fixture";
import {
  E2E_ADMIN_USERNAMES,
  seedSuiteAdmin,
  removeSuiteAdmin,
} from "./utils/shared-e2e-fixture";
import { resetSuiteBusinessRows } from "./utils/shared-e2e-business-fixture";

// Sentinel users. Deliberately OUTSIDE every suite's fixture namespace
// ("authspec_*", "searchspec_*") so no suite under test creates, resets or
// deletes them. If a suite's cleanup owned these rows, the checks below would
// prove nothing (issues #1197, #1199).
//
// One sentinel user PER CASE, for isolation between the cases themselves — a
// case cannot be affected by what an earlier case did to a shared row.
//
// This pattern originally carried a second reason: two logins by one user
// inside a single second collided on the UNIQUE refresh_tokens.tokenHash and
// the second returned 400. That is fixed (issue #1201 — the refresh token now
// carries a `jti` nonce), so a shared user would no longer break; the isolation
// reason above stands on its own and the per-case users stay.
const SENTINEL_USERNAMES = {
  auth: "sentinel_isolation_probe",
  search: "sentinel_isolation_probe_search",
  sharedE2e: "sentinel_isolation_probe_shared_e2e",
} as const;
const SENTINEL_USERNAME = SENTINEL_USERNAMES.auth;
const SENTINEL_SEARCH_USERNAME = SENTINEL_USERNAMES.search;
const SENTINEL_SHARED_E2E_USERNAME = SENTINEL_USERNAMES.sharedE2e;
const SENTINEL_PASSWORD = "Admin@123!";

// The checks are meaningless if a suite under test owns the sentinel. Assert
// it, don't assume it — for every namespace this file exercises.
for (const [setName, usernames] of [
  ["AUTH_USERNAMES", AUTH_USERNAMES],
  ["SEARCH_USERNAMES", SEARCH_USERNAMES],
  ["E2E_ADMIN_USERNAMES", Object.values(E2E_ADMIN_USERNAMES)],
] as const) {
  for (const sentinel of Object.values(SENTINEL_USERNAMES)) {
    if (usernames.includes(sentinel)) {
      throw new Error(
        `Sentinel "${sentinel}" is inside ${setName}. It must sit outside ` +
          `every suite's reset/cleanup ownership set or these checks prove ` +
          `nothing.`,
      );
    }
  }
}

// Likewise for the business-row sentinel: if its name matched a suite's cleanup
// predicate, its "survives" assertion would be testing the wrong thing.
const SENTINEL_CUSTOMER_NAME = "Sentinel Isolation Probe Trading";
for (const [name, prefix] of [
  ["SEARCH_NAME_PREFIX", SEARCH_NAME_PREFIX],
  ["FUZZY_NAME_PREFIX", FUZZY_NAME_PREFIX],
] as const) {
  const literal = prefix.replace(/%$/, "");
  if (SENTINEL_CUSTOMER_NAME.toLowerCase().startsWith(literal.toLowerCase())) {
    throw new Error(
      `Sentinel customer "${SENTINEL_CUSTOMER_NAME}" matches ${name} ` +
        `("${prefix}"). It must sit outside every suite's cleanup predicate.`,
    );
  }
}

describe("Suite isolation sentinel (e2e)", () => {
  let app: INestApplication;
  let ds: DataSource;
  let sentinelUserId: string;
  let sentinelSearchUserId: string;
  let sentinelSharedE2eUserId: string;
  let sentinelCustomerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = app.get(DataSource);

    sentinelUserId = await createSentinelUser(SENTINEL_USERNAME);
    sentinelSearchUserId = await createSentinelUser(SENTINEL_SEARCH_USERNAME);
    sentinelSharedE2eUserId = await createSentinelUser(
      SENTINEL_SHARED_E2E_USERNAME,
    );

    // A business row owned by nobody under test, so the search/fuzzy cases can
    // assert business data survives their cleanup — not just users.
    await ds.query(`DELETE FROM customers WHERE "name" = $1`, [
      SENTINEL_CUSTOMER_NAME,
    ]);
    const [customer] = await ds.query(
      `INSERT INTO customers ("name", "slug", "type")
       VALUES ($1, 'sentinel-isolation-probe-trading', 'individual') RETURNING id`,
      [SENTINEL_CUSTOMER_NAME],
    );
    sentinelCustomerId = customer.id;
  });

  async function createSentinelUser(username: string): Promise<string> {
    await ds.query(`DELETE FROM users WHERE username = $1`, [username]);
    const saved = await ds.getRepository(User).save(
      ds.getRepository(User).create({
        username,
        email: `${username}@test.com`,
        password: await bcrypt.hash(SENTINEL_PASSWORD, 12),
        firstName: "Sentinel",
        lastName: "Probe",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      }),
    );
    return saved.id;
  }

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DELETE FROM customers WHERE "name" = $1`, [
        SENTINEL_CUSTOMER_NAME,
      ]);
      await ds.query(`DELETE FROM users WHERE username = ANY($1)`, [
        Object.values(SENTINEL_USERNAMES),
      ]);
      await ds.query(`DELETE FROM users WHERE username = ANY($1)`, [
        Object.values(E2E_ADMIN_USERNAMES),
      ]);
      await ds.destroy();
    }
    await app.close();
  });

  it("survives auth's fixture operations with its token, user row and refresh tokens intact", async () => {
    // 1. Authenticate BEFORE auth's destructive operations.
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ usernameOrEmail: SENTINEL_USERNAME, password: SENTINEL_PASSWORD })
      .expect(200); // /auth/login returns 200, not 201 (auth.e2e-spec.ts:74)
    const token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();

    const tokensBefore = await ds
      .getRepository(RefreshToken)
      .count({ where: { userId: sentinelUserId } });
    expect(tokensBefore).toBeGreaterThan(0);

    // 2. Run auth's REAL fixture operation — the exact function
    //    auth.e2e-spec.ts calls in its own beforeEach/afterAll, imported from
    //    the shared module. Not a copy: a duplicated implementation would stop
    //    testing the real path the moment the two drifted.
    await resetAuthFixtureUsers(ds);

    // 3. The same token must still authenticate, and the rows must survive.
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const userRow = await ds
      .getRepository(User)
      .findOne({ where: { id: sentinelUserId } });
    expect(userRow).not.toBeNull();

    const tokensAfter = await ds
      .getRepository(RefreshToken)
      .count({ where: { userId: sentinelUserId } });
    expect(tokensAfter).toBe(tokensBefore);
  });

  // Separate cases per owning suite, so a failure names the responsible helper
  // rather than reporting "isolation broke" with three candidates.

  it("survives search's fixture operations with its token, user row, refresh tokens and business row intact", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        usernameOrEmail: SENTINEL_SEARCH_USERNAME,
        password: SENTINEL_PASSWORD,
      })
      .expect(200);
    const token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();

    const tokensBefore = await ds
      .getRepository(RefreshToken)
      .count({ where: { userId: sentinelSearchUserId } });
    expect(tokensBefore).toBeGreaterThan(0);

    // search.e2e-spec.ts's REAL fixture operation, imported — not a copy.
    await resetSearchFixtures(ds);

    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(
      await ds
        .getRepository(User)
        .findOne({ where: { id: sentinelSearchUserId } }),
    ).not.toBeNull();

    expect(
      await ds
        .getRepository(RefreshToken)
        .count({ where: { userId: sentinelSearchUserId } }),
    ).toBe(tokensBefore);

    const [customerRow] = await ds.query(
      `SELECT id FROM customers WHERE id = $1`,
      [sentinelCustomerId],
    );
    expect(customerRow).toBeDefined();
  });

  // ─── shared-e2e helpers (issue #1199) ──────────────────────────────────────
  // The six suites that called truncateAll() — a 15-table
  // `RESTART IDENTITY CASCADE` including users and refresh_tokens.

  it("survives the shared-e2e suites' fixture operations with token, refresh token, user row and business row intact", async () => {
    // 1. Mint credentials BEFORE any cleanup runs. Ordering is the whole point:
    //    under maxWorkers=1 a suite that authenticates AFTER the reset never
    //    observes the damage, which is why three reordered full-suite runs
    //    stayed green against a demonstrably destructive helper. This case
    //    holds a live credential across the cleanup on purpose.
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        usernameOrEmail: SENTINEL_SHARED_E2E_USERNAME,
        password: SENTINEL_PASSWORD,
      })
      .expect(200);
    const token = login.body?.data?.accessToken ?? login.body?.accessToken;
    const refreshToken =
      login.body?.data?.refreshToken ?? login.body?.refreshToken;
    expect(token).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    const tokensBefore = await ds
      .getRepository(RefreshToken)
      .count({ where: { userId: sentinelSharedE2eUserId } });
    expect(tokensBefore).toBeGreaterThan(0);

    // 2. Seed rows the helper OWNS, so this case also proves the cleanup
    //    actually cleans. A reset that deleted nothing would satisfy every
    //    survival assertion below trivially.
    const [ownedCategory] = await ds.query(
      `INSERT INTO categories ("name", "slug", "level")
       VALUES ($1, $2, 0) RETURNING id`,
      ["sentinel-owned-category-1199", "sentinel-owned-category-1199"],
    );
    const [ownedCustomer] = await ds.query(
      `INSERT INTO customers ("name", "slug", "type")
       VALUES ($1, $2, 'individual') RETURNING id`,
      ["Sentinel Owned Customer 1199", "sentinel-owned-customer-1199"],
    );

    // 3. Run the REAL replacement helper — imported, not a copy.
    await resetSuiteBusinessRows(ds, {
      categoryIds: [ownedCategory.id],
      customerIds: [ownedCustomer.id],
    });

    // 4a. Cleanup effectiveness: the owned rows must be GONE.
    expect(
      await ds.query(`SELECT id FROM categories WHERE id = $1`, [
        ownedCategory.id,
      ]),
    ).toHaveLength(0);
    expect(
      await ds.query(`SELECT id FROM customers WHERE id = $1`, [
        ownedCustomer.id,
      ]),
    ).toHaveLength(0);

    // 4b. Isolation: the live credential must still work.
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // The refresh token must still redeem. truncateAll() invalidated this too
    // ("Invalid refresh token"), so asserting /auth/me alone would miss half
    // the damage.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(200);

    expect(
      await ds
        .getRepository(User)
        .findOne({ where: { id: sentinelSharedE2eUserId } }),
    ).not.toBeNull();

    const [unrelatedCustomer] = await ds.query(
      `SELECT id FROM customers WHERE id = $1`,
      [sentinelCustomerId],
    );
    expect(unrelatedCustomer).toBeDefined();
  });

  it("leaves a suite-owned admin belonging to another suite untouched", async () => {
    // seedSuiteAdmin/removeSuiteAdmin replace seedAdmin()'s unconditional
    // INSERT of the single shared "admin". That insert only worked because
    // truncateAll() emptied `users` first: without it, a second caller violates
    // the username unique constraint on the FIRST run (verified 23505). Each
    // suite now owns its own row, and must not touch another's.
    const other = await seedSuiteAdmin(ds, E2E_ADMIN_USERNAMES.inventory);
    const mine = await seedSuiteAdmin(ds, E2E_ADMIN_USERNAMES.sales);

    await removeSuiteAdmin(ds, E2E_ADMIN_USERNAMES.sales);

    expect(
      await ds.getRepository(User).findOne({ where: { id: mine.id } }),
    ).toBeNull();
    expect(
      await ds.getRepository(User).findOne({ where: { id: other.id } }),
    ).not.toBeNull();

    await removeSuiteAdmin(ds, E2E_ADMIN_USERNAMES.inventory);
  });

  it("survives fuzzy-search's fixture operations with the unrelated business row intact", async () => {
    // fuzzy-search.e2e-spec.ts creates no users, so this case asserts business
    // data only. Its truncate was a business-data defect; it does NOT establish
    // the auth-cascade mechanism in #1197.
    await resetFuzzySearchFixtures(ds);

    const [customerRow] = await ds.query(
      `SELECT id FROM customers WHERE id = $1`,
      [sentinelCustomerId],
    );
    expect(customerRow).toBeDefined();

    expect(
      await ds.getRepository(User).findOne({ where: { id: sentinelUserId } }),
    ).not.toBeNull();
  });
});
