import { readStockEvidenceHorizon } from './stock-evidence-horizon';

describe('readStockEvidenceHorizon', () => {
  it('returns null when unset', () => {
    expect(readStockEvidenceHorizon(undefined)).toBeNull();
  });

  it('returns null for an empty or whitespace value', () => {
    expect(readStockEvidenceHorizon('')).toBeNull();
    expect(readStockEvidenceHorizon('   ')).toBeNull();
  });

  it('parses an ISO-8601 instant', () => {
    expect(readStockEvidenceHorizon('2026-10-01T00:00:00Z')).toEqual(
      new Date('2026-10-01T00:00:00Z'),
    );
  });

  it('throws the exact message for a non-ISO value', () => {
    expect(() => readStockEvidenceHorizon('yesterday')).toThrow(
      "Invalid STOCK_EVIDENCE_HORIZON: 'yesterday' (expected an ISO-8601 instant)",
    );
  });
});
