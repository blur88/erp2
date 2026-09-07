import {
  diffSnapshots,
  identityKey,
  migrationFingerprint,
  MAX_EXAMPLES,
} from "../../scripts/e2e-leakcheck.mjs";

// Snapshot shape: { [table]: { rows: [{ id, label }], unsupported?: true } }
const snap = (rows: Array<[string, string | null]>) => ({
  rows: rows.map(([id, label]) => ({ id, label })),
});

describe("identityKey", () => {
  it("supports composite primary keys unambiguously", () => {
    // Must not collide: ["a","b"] and ["a|b"] are different identities.
    expect(identityKey(["a", "b"])).not.toBe(identityKey(["a|b"]));
  });

  it("is stable for the same values", () => {
    expect(identityKey(["x", 1])).toBe(identityKey(["x", 1]));
  });
});

describe("diffSnapshots", () => {
  it("reports an equal-count replacement as +1/-1", () => {
    // The case a count comparison cannot see: one row removed, a different
    // one added, total unchanged. This is why row identity exists.
    const baseline = { price_lists: snap([["id-1", "RETAIL"]]) };
    const current = { price_lists: snap([["id-2", "RT-1757"]]) };

    const result = diffSnapshots(baseline, current);

    expect(result.hasDrift).toBe(true);
    const t = result.tables.find((x) => x.table === "price_lists")!;
    expect(t.addedTotal).toBe(1);
    expect(t.removedTotal).toBe(1);
    expect(t.added[0].label).toBe("RT-1757");
  });

  it("prints labels for removed rows from the baseline snapshot", () => {
    // The row is gone, so its label cannot come from a live lookup.
    const baseline = { users: snap([["u1", "admin"]]) };
    const current = { users: snap([]) };

    const t = diffSnapshots(baseline, current).tables.find(
      (x) => x.table === "users",
    )!;

    expect(t.removed[0].label).toBe("admin");
  });

  it("reports no drift when snapshots match", () => {
    const s = { users: snap([["u1", "admin"]]) };
    expect(diffSnapshots(s, s).hasDrift).toBe(false);
  });

  it("flags tables without a primary key as unsupported", () => {
    const baseline = { legacy_view: { rows: [], unsupported: true } };
    const current = { legacy_view: { rows: [], unsupported: true } };

    const result = diffSnapshots(baseline, current);

    expect(result.unsupportedTables).toEqual(["legacy_view"]);
  });

  it("caps displayed examples but reports full totals", () => {
    const many = Array.from(
      { length: MAX_EXAMPLES + 5 },
      (_, i) => [`id-${i}`, `L${i}`] as [string, string],
    );
    const t = diffSnapshots({ products: snap([]) }, {
      products: snap(many),
    }).tables.find((x) => x.table === "products")!;

    expect(t.added).toHaveLength(MAX_EXAMPLES);
    expect(t.addedTotal).toBe(MAX_EXAMPLES + 5);
  });
});

describe("migrationFingerprint", () => {
  it("changes when a migration is added", () => {
    const a = [{ timestamp: 1, name: "InitialSchema1" }];
    const b = [...a, { timestamp: 2, name: "AddThing2" }];
    expect(migrationFingerprint(a)).not.toBe(migrationFingerprint(b));
  });

  it("is order-independent", () => {
    const a = [
      { timestamp: 1, name: "A1" },
      { timestamp: 2, name: "B2" },
    ];
    const b = [...a].reverse();
    expect(migrationFingerprint(a)).toBe(migrationFingerprint(b));
  });
});
