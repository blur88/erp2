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
import { configureTestAppValidation } from "./utils/configure-test-app-validation";

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
    configureTestAppValidation(app);
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

    it("seeded the canonically-coded list when the table was otherwise empty", async () => {
      // Allow-listed: asserts the canonical row exists, not that it is the ONLY row.
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
    it("restores the soft-deleted canonical row and makes it the sole active default", async () => {
      // The collision case, staged with the REAL canonical code so the seeder's
      // findByCodeWithDeleted actually selects it:
      //
      //   - an INACTIVE live default  -> branch 1 finds no ACTIVE default
      //   - no other active list      -> branch 2 finds nothing to promote
      //   - a soft-deleted canonical row carrying a STALE isDefault = true
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
      // a second row with the canonical code therefore fails on duplicate key no
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
        // this test degrades the canonical row itself — afterEach's
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

  describe("seeder branch 2: promote the oldest active list", () => {
    it("promotes the OLDEST active list, not merely any active list", async () => {
      // Guards the deterministic tie-break rule (active > oldest createdAt >
      // lowest id). The unit test cannot cover this: its fake manager returns a
      // canned findOldestActive result and never sorts, so the ordering lives
      // entirely in the adapter's SQL and only an integration test can verify
      // it. Reversing `order` in findOldestActive must fail THIS test.
      const seeder = app.get(PriceListsSeederService);

      // Demote (do not soft-delete) the boot default, so branch 1 falls through
      // while afterEach's setDefault(originalDefaultId) still has a live target.
      await dataSource.query(
        `UPDATE price_lists SET "isDefault" = false WHERE id = $1`,
        [originalDefaultId],
      );

      // Deliberately inserted newest-first, so insertion order cannot be
      // mistaken for the thing under test. The boot default (created before all
      // three) is deactivated below, leaving E2E-DEF-C the oldest ACTIVE row.
      const mk = async (code: string, createdAt: string) => {
        const [row] = await dataSource.query(
          `INSERT INTO price_lists (code, name, "isDefault", "isActive", priority, "createdAt")
           VALUES ($1, $2, false, true, 0, $3) RETURNING id`,
          [code, code, createdAt],
        );
        return row.id as string;
      };
      const newest = await mk("E2E-DEF-A", "2024-03-01T00:00:00Z");
      const middle = await mk("E2E-DEF-B", "2024-02-01T00:00:00Z");
      const oldest = await mk("E2E-DEF-C", "2024-01-01T00:00:00Z");

      // The boot default predates all three; deactivating it keeps it out of
      // findOldestActive's candidate set without soft-deleting it.
      await dataSource.query(
        `UPDATE price_lists SET "isActive" = false WHERE id = $1`,
        [originalDefaultId],
      );

      try {
        await seeder.seed();

        const rows = await dataSource.query(
          `SELECT id, "isDefault" FROM price_lists WHERE id = ANY($1)`,
          [[newest, middle, oldest]],
        );
        const promoted = rows.filter((r: any) => r.isDefault).map((r: any) => r.id);

        expect(promoted).toEqual([oldest]);
        expect(await countLiveDefaults()).toBe(1);
      } finally {
        // Reactivate the boot default so afterEach can transfer back to it.
        await dataSource.query(
          `UPDATE price_lists SET "isActive" = true WHERE id = $1`,
          [originalDefaultId],
        );
      }
    });

    it("breaks a createdAt tie on the lowest id", async () => {
      // The second clause of the tie-break rule. Covered separately because the
      // test above cannot reach it: with distinct createdAt values the `id: ASC`
      // term never decides anything, so dropping it leaves that test green.
      const seeder = app.get(PriceListsSeederService);

      await dataSource.query(
        `UPDATE price_lists SET "isDefault" = false WHERE id = $1`,
        [originalDefaultId],
      );

      // Identical createdAt on both rows, so ONLY the id ordering can decide.
      const tie = "2024-05-01T00:00:00Z";
      const ids: string[] = [];
      for (const code of ["E2E-DEF-A", "E2E-DEF-B"]) {
        const [row] = await dataSource.query(
          `INSERT INTO price_lists (code, name, "isDefault", "isActive", priority, "createdAt")
           VALUES ($1, $1, false, true, 0, $2) RETURNING id`,
          [code, tie],
        );
        ids.push(row.id);
      }
      // uuid_generate_v4 gives no ordering guarantee, so derive the expected
      // winner from the ids actually generated rather than assuming insert order.
      const lowest = [...ids].sort()[0];

      await dataSource.query(
        `UPDATE price_lists SET "isActive" = false WHERE id = $1`,
        [originalDefaultId],
      );

      try {
        await seeder.seed();

        const rows = await dataSource.query(
          `SELECT id, "isDefault" FROM price_lists WHERE id = ANY($1)`,
          [ids],
        );
        const promoted = rows.filter((r: any) => r.isDefault).map((r: any) => r.id);

        expect(promoted).toEqual([lowest]);
        expect(await countLiveDefaults()).toBe(1);
      } finally {
        await dataSource.query(
          `UPDATE price_lists SET "isActive" = true WHERE id = $1`,
          [originalDefaultId],
        );
      }
    });
  });

  describe("concurrency", () => {
    it("serialises competing transfers instead of failing one on the constraint", async () => {
      const a = await makeList("E2E-DEF-B");
      const b = await makeList("E2E-DEF-C");

      // Both must SUCCEED. Asserting only "one default remains" would pass even
      // if the loser died on a unique-constraint violation — the two-success
      // assertion is what proves the transfers serialise rather than the index
      // rejecting one of them.
      //
      // KNOWN LIMITATION: this test does NOT fail if acquireLock is removed from
      // assignDefault. The transfers really do overlap (instrumented: both start
      // before either ends, on a 10-connection pool), but assignDefault ends with
      // manager.save(entity), which emits `UPDATE ... WHERE id = ...`; under
      // READ COMMITTED the second transaction blocks on the row lock the first
      // already holds and re-reads after it commits. Postgres row locking
      // serialises this particular write shape on its own.
      //
      // The advisory lock is still load-bearing — a variant writing via
      // `update({ id }, ...)` instead of `save(entity)` fails BOTH transfers with
      // "duplicate key value violates unique constraint
      // UQ_price_lists_single_default". So do not conclude from a green run here
      // that the lock is removable; it guards write shapes this test does not
      // exercise, and the read-then-guard races in
      // PriceListsService.update/remove that row locking cannot cover at all.
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
