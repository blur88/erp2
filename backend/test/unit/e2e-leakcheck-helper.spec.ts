import {
  compareMigrationSets,
  diffSnapshots,
  expectedMigrationNames,
  formatReport,
  identityKey,
  migrationFingerprint,
  validateSnapshotShape,
  MAX_EXAMPLES,
} from "../../scripts/e2e-leakcheck.mjs";
import * as path from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

describe("formatReport", () => {
  const drift = {
    tables: [
      {
        table: "price_lists",
        added: [{ id: "id-2", label: "RT-1757" }],
        removed: [],
        addedTotal: 1,
        removedTotal: 0,
      },
    ],
    unsupportedTables: [],
    hasDrift: true,
  };

  it("reports drift, never suite ownership", () => {
    const out = formatReport("pass-1", drift);
    expect(out).toContain("baseline drift");
    // The tool compares database states; it cannot know which suite made a
    // row, so it must never claim to.
    expect(out).not.toMatch(/owning suite|owned by/i);
  });

  it("always lists all three causes, unconditionally", () => {
    const out = formatReport("pass-1", drift);
    expect(out).toContain("left fixtures behind");
    expect(out).toContain("--fresh");
    expect(out).toContain("already drifted");
  });

  it("names the table and the identity with its label", () => {
    const out = formatReport("pass-1", drift);
    expect(out).toContain("price_lists");
    expect(out).toContain("RT-1757");
  });
});

describe("expectedMigrationNames", () => {
  it("derives the applied name from the filename", () => {
    // TypeORM records migrations.name as the CLASS name:
    // 1788201872664-AddFormBTaxView.ts -> AddFormBTaxView1788201872664
    const names = expectedMigrationNames(
      path.resolve(__dirname, "../../src/database/migrations"),
    );
    expect(names).toContain("AddFormBTaxView1788201872664");
    expect(names.length).toBeGreaterThan(0);
  });
});

describe("compareMigrationSets", () => {
  it("rejects a migration the checkout expects but the database lacks", () => {
    // The gap the stored-vs-applied fingerprint cannot see: both fingerprints
    // match because the database is compared to itself.
    const result = compareMigrationSets(["A1", "B2"], ["A1", "B2", "C3"]);
    expect(result.ok).toBe(false);
    expect(result.pending).toEqual(["C3"]);
  });

  it("reports a migration applied but absent from the checkout", () => {
    const result = compareMigrationSets(["A1", "B2", "Z9"], ["A1", "B2"]);
    expect(result.ok).toBe(false);
    expect(result.unexpected).toEqual(["Z9"]);
  });

  it("accepts identical sets regardless of order", () => {
    expect(compareMigrationSets(["B2", "A1"], ["A1", "B2"]).ok).toBe(true);
  });
});

describe("validateSnapshotShape", () => {
  // A malformed stored snapshot must be a prerequisite failure, never a diff
  // against garbage: a missing `rows` array would read as an empty table and
  // report every real row as an addition — a fabricated finding.
  it("rejects a non-object snapshot", () => {
    expect(validateSnapshotShape(null).ok).toBe(false);
    expect(validateSnapshotShape([]).ok).toBe(false);
    expect(validateSnapshotShape("nope").ok).toBe(false);
  });

  it("rejects a table whose rows are not an array", () => {
    const r = validateSnapshotShape({ users: { rows: "nope" } });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("users");
  });

  it("rejects a row without a string id", () => {
    const r = validateSnapshotShape({ users: { rows: [{ label: "x" }] } });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("users");
  });

  it("accepts a well-formed snapshot", () => {
    expect(
      validateSnapshotShape({ users: { rows: [{ id: "u1", label: "admin" }] } })
        .ok,
    ).toBe(true);
  });
});
