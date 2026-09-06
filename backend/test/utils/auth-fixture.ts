import { DataSource } from 'typeorm';

// Suite-private namespace for auth.e2e-spec.ts. This suite must never create or
// delete a user any other suite authenticates as — six suites log in as "admin"
// (issue #1197).
export const AUTH_NS = 'authspec';
export const AUTH_ADMIN_USERNAME = `${AUTH_NS}_admin`;
export const AUTH_MANAGER_USERNAME = `${AUTH_NS}_manager`;
export const AUTH_SALES_USERNAME = `${AUTH_NS}_sales`;

export const AUTH_USERNAMES: readonly string[] = [
  AUTH_ADMIN_USERNAME,
  AUTH_MANAGER_USERNAME,
  AUTH_SALES_USERNAME,
];

/**
 * The ONE destructive fixture operation auth.e2e-spec.ts performs.
 *
 * Own-rows deletion only. This previously was
 * `TRUNCATE TABLE refresh_tokens, users RESTART IDENTITY CASCADE`, which
 * destroyed every other suite's users and refresh tokens on the shared DB
 * (issue #1197).
 *
 * auth.e2e-spec.ts and auth-isolation-sentinel.e2e-spec.ts both call this, so
 * the sentinel proves a property of the real code path. Widening what this
 * deletes is exactly what the sentinel is there to catch.
 *
 * Refresh tokens cascade via RefreshToken.userId (onDelete: 'CASCADE').
 */
export async function resetAuthFixtureUsers(ds: DataSource): Promise<void> {
  await ds.query(`DELETE FROM users WHERE username = ANY($1)`, [
    [...AUTH_USERNAMES],
  ]);
}
