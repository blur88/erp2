/**
 * The stock-evidence horizon (#1406).
 *
 * `STOCK_EVIDENCE_HORIZON` is the instant before which a pre-deploy (legacy)
 * purchase receipt's stock history is not considered complete enough to prove
 * its goods are untouched. It is a *restriction*, not proof: it must be unset
 * unless independent evidence supports completeness, and the approved value is
 * documented per environment. Unset means every pre-deploy receipt is refused.
 *
 * A malformed value fails startup (read once at module init), like
 * `REFRESH_GRACE_SECONDS`.
 */
const ISO_8601_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function readStockEvidenceHorizon(raw: string | undefined): Date | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  if (!ISO_8601_INSTANT.test(raw.trim())) {
    throw new Error(
      `Invalid STOCK_EVIDENCE_HORIZON: '${raw}' (expected an ISO-8601 instant)`,
    );
  }
  const parsed = new Date(raw.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid STOCK_EVIDENCE_HORIZON: '${raw}' (expected an ISO-8601 instant)`,
    );
  }
  return parsed;
}
