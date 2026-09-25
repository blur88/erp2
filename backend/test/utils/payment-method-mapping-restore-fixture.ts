import { DataSource } from 'typeorm';

/**
 * Exact restore of a payment method's mapping row after a test remaps it
 * (issue #1293).
 *
 * Restoring through `PUT /accounting/settings/payment-method-mappings` is not
 * enough for a BASELINE method (CIMB, SHOPEE): `setMappings()` deletes and
 * re-inserts, so the restored row has the same account but a new id and new
 * timestamps, and the nightly leak check (which compares primary keys) reports
 * it as drift. The service is correct as it is — only the test restore changes.
 *
 * The row is carried as jsonb (`to_jsonb` / `jsonb_populate_record`), not as a
 * pg row object: node-postgres turns `timestamptz` into a JS Date, which drops
 * microseconds, so a Date round-trip would silently rewrite `createdAt` and
 * `updatedAt` — and a read-back compared through Dates would still pass. jsonb
 * keeps every column's exact value, picks up any column added later, and needs
 * no dynamic identifiers: the table name is a literal and the row is one
 * parameter.
 */
export type MappingSnapshot = Record<string, unknown> | null;

/** The method's full mapping row, or null when it has none. */
export async function snapshotMapping(ds: DataSource, methodId: string): Promise<MappingSnapshot> {
  const [row] = await ds.query(
    `SELECT to_jsonb(m) AS row FROM payment_method_account_mappings m WHERE m."paymentMethodId" = $1`,
    [methodId],
  );
  return row?.row ?? null;
}

/**
 * Put the method's mapping back exactly as `snapshot` recorded it — same id,
 * same timestamps, every column — or remove it when there was none. The
 * read-back runs inside the same transaction, so a mismatch rolls the restore
 * back and fails the caller instead of committing a near-copy.
 *
 * Mapping deletes are hard (see the entity docblock), so the method has at
 * most one row and no soft-deleted residue to account for.
 */
export async function restoreMapping(
  ds: DataSource,
  methodId: string,
  snapshot: MappingSnapshot,
): Promise<void> {
  await ds.transaction(async (m) => {
    await m.query(`DELETE FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`, [methodId]);
    if (snapshot) {
      await m.query(
        `INSERT INTO payment_method_account_mappings
         SELECT * FROM jsonb_populate_record(NULL::payment_method_account_mappings, $1::jsonb)`,
        [JSON.stringify(snapshot)],
      );
    }
    // jsonb equality in Postgres: exact per value, independent of key order.
    const [check] = await m.query(
      `SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) AS restored,
              COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) = $2::jsonb AS matches
         FROM payment_method_account_mappings m WHERE m."paymentMethodId" = $1`,
      [methodId, JSON.stringify(snapshot ? [snapshot] : [])],
    );
    const restored = check.restored;
    if (!check.matches) {
      throw new Error(
        `Mapping restore for method ${methodId} did not reproduce the snapshot:\n` +
          `expected ${JSON.stringify(snapshot)}\nactual   ${JSON.stringify(restored)}`,
      );
    }
  });
}
