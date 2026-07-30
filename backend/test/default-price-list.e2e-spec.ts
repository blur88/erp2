import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module";
import { PriceList } from "../src/database/entities/price-list.entity";
import { PriceListsService } from "../src/modules/price-lists/services/price-lists.service";
import {
  DEFAULT_PRICE_LIST_CODE,
  PriceListsSeederService,
} from "../src/modules/price-lists/services/price-lists-seeder.service";
import { AddSingleDefaultPriceListConstraint1785600000000 } from "../src/database/migrations/1785600000000-AddSingleDefaultPriceListConstraint";

describe("Default price list (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let service: PriceListsService;

  // Rows this suite creates, so cleanup never touches rows it does not own.
  const ownedCodes = ["E2E-DEF-A", "E2E-DEF-B", "E2E-DEF-C"];

  // The boot-seeded default, captured once and restored after every test so a
  // mid-test failure cannot leave the shared database with zero defaults.
  let originalDefaultId: string;

  const countLiveDefaults = async (): Promise<number> => {
    const rows = await dataSource.query(
      `SELECT count(*)::int AS n FROM price_lists WHERE "isDefault" = true AND "deletedAt" IS NULL`,
    );
    return rows[0].n;
  };

  const makeList = async (code: string, isActive = true): Promise<PriceList> =>
    dataSource.getRepository(PriceList).save({
      code,
      name: code,
      isActive,
      isDefault: false,
      priority: 0,
    } as any);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    service = app.get(PriceListsService);

    // The seeder guarantees this exists by the time app.init() resolves.
    originalDefaultId = (await service.getDefaultPriceList()).id;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  afterEach(async () => {
    // Restore the boot-seeded default BEFORE deleting owned rows.
    //
    // A transfer test that fails mid-way leaves one of this suite's own rows as
    // the default; deleting it first would leave the database with ZERO
    // defaults and cascade failures into every later test and suite.
    //
    // Uses the real transfer path rather than raw UPDATEs: cleanup that
    // bypasses the advisory lock and the unset-before-set ordering would be
    // exercising something this feature does not permit anywhere else, and
    // would mask a broken assignDefault. It is idempotent — assignDefault
    // no-ops when the target already holds the flag.
    await service.setDefault(originalDefaultId);

    // Allow-list cleanup: only the rows this suite created.
    await dataSource.query(
      `DELETE FROM price_lists WHERE code = ANY($1)`,
      [ownedCodes],
    );
  });

  describe("boot-time seeding", () => {
    it("leaves exactly one active default after boot", async () => {
      expect(await countLiveDefaults()).toBe(1);
    });

    it("getDefaultPriceList resolves instead of throwing NotFound", async () => {
      const found = await service.getDefaultPriceList();
      expect(found).toBeDefined();
      expect(found.isActive).toBe(true);
      expect(found.isDefault).toBe(true);
    });

    it("seeded a DEFAULT-coded list when the table was otherwise empty", async () => {
      // Allow-listed: asserts the DEFAULT row exists, not that it is the ONLY row.
      const row = await dataSource
        .getRepository(PriceList)
        .findOne({ where: { code: DEFAULT_PRICE_LIST_CODE } });
      expect(row).toBeTruthy();
    });
  });

  describe("the partial unique index", () => {
    it("rejects a second live default written directly to the table", async () => {
      // Must bypass the service: every service path locks and unsets first, so
      // writing around them is the only way to reach the constraint.
      const extra = await makeList("E2E-DEF-A");

      await expect(
        dataSource.query(
          `UPDATE price_lists SET "isDefault" = true WHERE id = $1`,
          [extra.id],
        ),
      ).rejects.toThrow(/UQ_price_lists_single_default/);
    });
  });

  describe("invariant enforcement through the service", () => {
    it("rejects making an inactive list the default", async () => {
      const inactive = await makeList("E2E-DEF-A", false);

      await expect(service.setDefault(inactive.id)).rejects.toThrow(
        /inactive price list cannot be made default/i,
      );
    });

    it("leaves exactly one default after transferring", async () => {
      const other = await makeList("E2E-DEF-A");

      await service.setDefault(other.id);

      expect(await countLiveDefaults()).toBe(1);
      // afterEach restores the original default.
    });

    it("refuses to deactivate the current default", async () => {
      const current = await service.getDefaultPriceList();

      await expect(
        service.update(current.id, { isActive: false } as any),
      ).rejects.toThrow(/Cannot deactivate the default/i);
    });

    it("refuses to delete the current default", async () => {
      const current = await service.getDefaultPriceList();

      await expect(service.remove(current.id)).rejects.toThrow(
        /Cannot delete the default/i,
      );
    });
  });

  describe("the migration's duplicate reconciliation", () => {
    it("keeps the deterministic survivor: active, then oldest createdAt, then lowest id", async () => {
      // Runs entirely inside a QueryRunner transaction that is ROLLED BACK, so
      // the shared database never actually loses its index or gains duplicates.
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();

      try {
        // The index is what prevents duplicates from being created at all, so
        // it must come off before the broken state can be staged.
        await runner.query(`DROP INDEX "UQ_price_lists_single_default"`);
        await runner.query(
          `UPDATE price_lists SET "isDefault" = false WHERE "isDefault" = true`,
        );

        // Three live defaults. Expected survivor: MIG-B — the only ACTIVE one
        // ranks above MIG-A despite MIG-A being older.
        const mk = async (
          code: string,
          isActive: boolean,
          createdAt: string,
        ) => {
          const [row] = await runner.query(
            `INSERT INTO price_lists (code, name, "isDefault", "isActive", priority, "createdAt")
             VALUES ($1, $2, true, $3, 0, $4) RETURNING id`,
            [code, code, isActive, createdAt],
          );
          return row.id as string;
        };

        await mk("MIG-A", false, "2020-01-01T00:00:00Z");
        const survivor = await mk("MIG-B", true, "2021-01-01T00:00:00Z");
        await mk("MIG-C", true, "2022-01-01T00:00:00Z");

        const migration = new AddSingleDefaultPriceListConstraint1785600000000();
        await migration.up(runner);

        const remaining = await runner.query(
          `SELECT id, code FROM price_lists
           WHERE "isDefault" = true AND "deletedAt" IS NULL`,
        );

        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe(survivor);
        expect(remaining[0].code).toBe("MIG-B");
      } finally {
        // Discards the dropped index, the staged duplicates and the migration's
        // own writes in one step.
        await runner.rollbackTransaction();
        await runner.release();
      }
    });

    it("is safe to run against a table that already satisfies the invariant", async () => {
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();

      try {
        await runner.query(`DROP INDEX "UQ_price_lists_single_default"`);

        const migration = new AddSingleDefaultPriceListConstraint1785600000000();
        await migration.up(runner);

        const remaining = await runner.query(
          `SELECT count(*)::int AS n FROM price_lists
           WHERE "isDefault" = true AND "deletedAt" IS NULL`,
        );
        expect(remaining[0].n).toBe(1);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });
  });

  describe("seeder restore path against the real index", () => {
    it("restores the soft-deleted DEFAULT row and makes it the sole active default", async () => {
      // The collision case, staged with the REAL canonical code so the seeder's
      // findByCodeWithDeleted actually selects it:
      //
      //   - an INACTIVE live default  -> branch 1 finds no ACTIVE default
      //   - no other active list      -> branch 2 finds nothing to promote
      //   - a soft-deleted DEFAULT row carrying a STALE isDefault = true
      //
      // The seeder therefore reaches the restore path, where clearing deletedAt
      // without clearing isDefault would drag the stale flag into the governed
      // set and violate UQ_price_lists_single_default.
      //
      // This exercises the real seeder against the real index and asserts the
      // OUTCOME. Asserting only that the naive UPDATE fails would prove the bug
      // exists, not that the fix works.
      const seeder = app.get(PriceListsSeederService);

      const priceLists = dataSource.getRepository(PriceList);
      const staged: string[] = [];
      // Pre-existing live rows this test soft-deletes, so the finally block can
      // un-park exactly those and nothing else.
      let parked: string[] = [];

      // PriceList.code is `unique: true` (price-list.entity.ts:26) — an
      // UNCONDITIONAL constraint that still covers soft-deleted rows. Inserting
      // a second row with code DEFAULT therefore fails on duplicate key no
      // matter what is done to the existing one. So the canonical row IS the
      // squatter: snapshot it, degrade it into the state under test, and
      // restore the snapshot afterwards.
      const squatter = await priceLists.findOne({
        where: { code: DEFAULT_PRICE_LIST_CODE },
        withDeleted: true,
      } as any);
      expect(squatter).toBeTruthy();
      const snapshot = {
        isDefault: squatter!.isDefault,
        isActive: squatter!.isActive,
        deletedAt: squatter!.deletedAt,
      };

      try {
        // Degrade the canonical row into the collision state: soft-deleted,
        // inactive, carrying a STALE isDefault = true.
        await dataSource.query(
          `UPDATE price_lists
           SET "isDefault" = true, "isActive" = false, "deletedAt" = now()
           WHERE id = $1`,
          [squatter!.id],
        );

        // Any other live list would satisfy branch 2 and short-circuit the path
        // under test. RETURNING id records precisely what was parked.
        const parkedRows = await dataSource.query(
          `UPDATE price_lists SET "deletedAt" = now()
           WHERE "deletedAt" IS NULL AND id <> $1
           RETURNING id`,
          [squatter!.id],
        );
        parked = parkedRows.map((r: any) => r.id);

        // The inactive live default the stale flag would collide with. Inserted
        // AFTER the squatter is soft-deleted, so only one live isDefault row
        // exists at any moment and the partial index is never violated during
        // setup.
        const [inactive] = await dataSource.query(
          `INSERT INTO price_lists (code, name, "isDefault", "isActive", priority)
           VALUES ('E2E-INACTIVE-DEF', 'inactive default', true, false, 0)
           RETURNING id`,
        );
        staged.push(inactive.id);

        // The real thing: adapter, advisory lock, reactivate, assignDefault.
        // Without reactivate clearing the stale isDefault, this call fails on
        // UQ_price_lists_single_default.
        await seeder.seed();

        const restored = await priceLists.findOne({
          where: { id: squatter!.id },
        });
        expect(restored).toBeTruthy();
        expect(restored!.deletedAt).toBeNull();
        expect(restored!.isActive).toBe(true);
        expect(restored!.isDefault).toBe(true);
        // Non-destructive: the seeder reuses the row, it does not rewrite it.
        expect(restored!.name).toBe(squatter!.name);
        expect(restored!.description).toBe(squatter!.description);

        // The incumbent is demoted, and exactly one default remains overall.
        const incumbent = await priceLists.findOne({
          where: { id: inactive.id },
        });
        expect(incumbent!.isDefault).toBe(false);
        expect(await countLiveDefaults()).toBe(1);
      } finally {
        // Cleanup is explicit here rather than deferred to afterEach, because
        // this test degrades the canonical DEFAULT row itself — afterEach's
        // setDefault(originalDefaultId) would reject it while soft-deleted.
        //
        // Order matters: drop staged rows first so no live isDefault row
        // competes, then restore the snapshot, then un-park.
        if (staged.length) {
          await dataSource.query(`DELETE FROM price_lists WHERE id = ANY($1)`, [
            staged,
          ]);
        }
        await dataSource.query(
          `UPDATE price_lists SET "isDefault" = false
           WHERE "isDefault" = true AND "deletedAt" IS NULL AND id <> $1`,
          [squatter!.id],
        );
        // Restore the canonical row's snapshotted fields verbatim.
        await dataSource.query(
          `UPDATE price_lists
           SET "isDefault" = $2, "isActive" = $3, "deletedAt" = $4
           WHERE id = $1`,
          [squatter!.id, snapshot.isDefault, snapshot.isActive, snapshot.deletedAt],
        );
        if (parked.length) {
          await dataSource.query(
            `UPDATE price_lists SET "deletedAt" = NULL WHERE id = ANY($1)`,
            [parked],
          );
        }
      }
    });
  });

  describe("concurrency", () => {
    it("serialises competing transfers instead of failing one on the constraint", async () => {
      const a = await makeList("E2E-DEF-B");
      const b = await makeList("E2E-DEF-C");

      // Both must SUCCEED. Asserting only "one default remains" would pass even
      // if the loser died on a unique-constraint violation — the two-success
      // assertion is what proves the advisory lock serialises the transfers
      // rather than the index rejecting one of them.
      const results = await Promise.allSettled([
        service.setDefault(a.id),
        service.setDefault(b.id),
      ]);

      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toEqual([]);

      expect(await countLiveDefaults()).toBe(1);
      // afterEach restores the original default.
    });
  });
});
