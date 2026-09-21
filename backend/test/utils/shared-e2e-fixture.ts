import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import {
  User,
  UserRole,
  UserStatus,
} from "../../src/database/entities/user.entity";

/**
 * Suite-owned admin users for the six suites that previously called
 * `truncateAll()` (issue #1199).
 *
 * ## Why these are per-suite rather than one shared "admin"
 *
 * `seedAdmin()` did an unconditional INSERT of username "admin". That only ever
 * worked because `truncateAll()` ran immediately before it and emptied `users`.
 * Remove the truncate and the second caller violates
 * UQ_fe0bb3f6520ee0469504521e710 (verified: 23505 duplicate key) on the FIRST
 * run — not intermittently. So dropping the truncate REQUIRES replacing the
 * shared-admin insert; the two changes cannot be separated.
 *
 * Each suite gets its own row. A suite that deletes its own admin then cannot
 * invalidate a token another suite is holding, which is the exact failure the
 * truncates produced: a live access token AND its refresh token both 401 with
 * "User not found" after an unrelated suite's cleanup.
 *
 * These names sit outside AUTH_USERNAMES, SEARCH_USERNAMES and the sentinel
 * namespace, so no suite's cleanup owns another's rows.
 */
export const SHARED_E2E_NS = "e2espec";

export const E2E_ADMIN_USERNAMES = {
  sales: `${SHARED_E2E_NS}_sales_admin`,
  purchasing: `${SHARED_E2E_NS}_purchasing_admin`,
  inventory: `${SHARED_E2E_NS}_inventory_admin`,
  salesOrderEdit: `${SHARED_E2E_NS}_so_edit_admin`,
  calendarDates: `${SHARED_E2E_NS}_calendar_admin`,
  transitions: `${SHARED_E2E_NS}_transitions_admin`,
  precision: `${SHARED_E2E_NS}_precision_admin`,
} as const;

export const E2E_ADMIN_PASSWORD = "Admin@123!";

/**
 * Creates (or recreates) one suite-owned admin and returns its id.
 *
 * Deletes its own row first so an interrupted previous run cannot leave a
 * duplicate behind — the same own-rows-reset-before-seed shape the search and
 * auth fixtures use.
 */
export async function seedSuiteAdmin(
  ds: DataSource,
  username: string,
): Promise<User> {
  await ds.query(`DELETE FROM users WHERE username = $1`, [username]);
  const repo = ds.getRepository(User);
  return repo.save(
    repo.create({
      username,
      email: `${username}@test.example`,
      password: await bcrypt.hash(E2E_ADMIN_PASSWORD, 12),
      firstName: "E2E",
      lastName: "Admin",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    }),
  );
}

export async function removeSuiteAdmin(
  ds: DataSource,
  username: string,
  opts: { expectExisting?: boolean } = {},
): Promise<void> {
  // refresh_tokens cascade via RefreshToken.userId (onDelete: 'CASCADE').
  //
  // The affected-row count is asserted because a DELETE matching nothing is
  // not an error: `payment-allocation-retired` passed a UUID here, matched no
  // username, deleted nothing, reported nothing, and leaked its admin on every
  // run until the nightly leak check caught it (#1259).
  //
  // `expectExisting: false` is for a deliberate own-rows reset BEFORE seeding,
  // where zero rows is the correct outcome on a clean database. It is opt-in so
  // that teardown — where zero rows always means a bug — keeps the strict
  // default.
  const result = await ds.query(`DELETE FROM users WHERE username = $1`, [
    username,
  ]);

  // Shape-checked rather than destructured blind: a driver/TypeORM change to
  // the [rows, rowCount] tuple would otherwise silently turn `affected` into
  // `undefined`, and `undefined === 0` is false — the guard below would stop
  // throwing with no signal at all, exactly the silent-failure class #1259
  // exists to eliminate.
  const affected = Array.isArray(result) ? result[1] : undefined;

  if (typeof affected !== "number") {
    throw new Error(
      `removeSuiteAdmin could not read an affected-row count from the driver ` +
        `(got ${JSON.stringify(result)}). This helper's leak guard depends on ` +
        `TypeORM's Postgres DELETE returning [rows, rowCount]; if that shape ` +
        `changed, the guard must be updated rather than silently skipped (#1259).`,
    );
  }

  if (opts.expectExisting !== false && affected === 0) {
    throw new Error(
      `removeSuiteAdmin deleted no rows for "${username}". ` +
        `This helper takes a USERNAME, not a user id — a UUID matches no ` +
        `username, so the DELETE affects zero rows, reports no error, and the ` +
        `row leaks silently (#1259). ` +
        `For a deliberate pre-seed reset, pass { expectExisting: false }.`,
    );
  }
}
