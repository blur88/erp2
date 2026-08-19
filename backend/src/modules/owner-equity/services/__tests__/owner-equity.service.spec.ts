import { OwnerEquityService } from '../owner-equity.service';
import {
  OwnerEquityDocumentStatus as DS,
  OwnerEquitySettlementStatus as SS,
} from '../../entities/owner-equity-document.entity';

describe('OwnerEquityService.computeAggregates', () => {
  it('reports UNSETTLED with no settlements', () => {
    expect(OwnerEquityService.computeAggregates('1000.0000', [])).toEqual({
      settledAmount: '0.0000',
      balance: '1000.0000',
      settlementStatus: SS.UNSETTLED,
    });
  });
  it('reports PARTIAL below the total', () => {
    expect(
      OwnerEquityService.computeAggregates('1000.0000', [
        { amount: '400.0000' },
      ]),
    ).toEqual({
      settledAmount: '400.0000',
      balance: '600.0000',
      settlementStatus: SS.PARTIAL,
    });
  });
  it('reports SETTLED at exactly the total', () => {
    expect(
      OwnerEquityService.computeAggregates('1000.0000', [
        { amount: '400.0000' },
        { amount: '600.0000' },
      ]),
    ).toEqual({
      settledAmount: '1000.0000',
      balance: '0.0000',
      settlementStatus: SS.SETTLED,
    });
  });
  it('nets refunds back out', () => {
    expect(
      OwnerEquityService.computeAggregates('1000.0000', [
        { amount: '1000.0000' },
        { amount: '-250.0000' },
      ]),
    ).toEqual({
      settledAmount: '750.0000',
      balance: '250.0000',
      settlementStatus: SS.PARTIAL,
    });
  });
});

describe('OwnerEquityService.deriveDocumentStatus', () => {
  it('promotes DRAFT to COMPLETED when fully settled', () => {
    expect(OwnerEquityService.deriveDocumentStatus(DS.DRAFT, SS.SETTLED)).toBe(
      DS.COMPLETED,
    );
  });
  it('demotes COMPLETED to DRAFT when a partial refund drops it below full', () => {
    // Completion is derived, not protected (#1094): refund is the only
    // reversal, so it must be able to unwind the status it created.
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.COMPLETED, SS.PARTIAL),
    ).toBe(DS.DRAFT);
  });
  it('demotes COMPLETED to DRAFT when fully refunded', () => {
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.COMPLETED, SS.UNSETTLED),
    ).toBe(DS.DRAFT);
  });
  it('keeps COMPLETED while still fully settled', () => {
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.COMPLETED, SS.SETTLED),
    ).toBe(DS.COMPLETED);
  });
  it('protects CANCELLED from automatic derivation', () => {
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.CANCELLED, SS.SETTLED),
    ).toBe(DS.CANCELLED);
  });
  it('does NOT promote OVERSETTLED to COMPLETED', () => {
    // Over-settlement means the balance is wrong; the document must stay
    // correctable rather than read as complete.
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.DRAFT, SS.OVERSETTLED),
    ).toBe(DS.DRAFT);
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.COMPLETED, SS.OVERSETTLED),
    ).toBe(DS.DRAFT);
  });
});

describe('OwnerEquityService.stampCompletionMetadata', () => {
  const AT = new Date('2026-08-19T10:00:00.000Z');

  it('stamps completedAt/completedBy when entering COMPLETED', () => {
    expect(
      OwnerEquityService.stampCompletionMetadata(
        DS.COMPLETED,
        { completedAt: null, completedBy: null },
        'alice',
        AT,
      ),
    ).toEqual({ completedAt: AT, completedBy: 'alice' });
  });

  it('preserves the original stamp while it stays COMPLETED', () => {
    const original = new Date('2026-08-01T00:00:00.000Z');
    expect(
      OwnerEquityService.stampCompletionMetadata(
        DS.COMPLETED,
        { completedAt: original, completedBy: 'bob' },
        'alice',
        AT,
      ),
    ).toEqual({ completedAt: original, completedBy: 'bob' });
  });

  it('falls back to system when no username is supplied', () => {
    expect(
      OwnerEquityService.stampCompletionMetadata(
        DS.COMPLETED,
        { completedAt: null, completedBy: null },
        undefined,
        AT,
      ),
    ).toEqual({ completedAt: AT, completedBy: 'system' });
  });

  it('clears the stamp when leaving COMPLETED', () => {
    // CHK_oe_completion_metadata rejects a non-COMPLETED row that still
    // carries a stamp, so a refund that demotes MUST clear it.
    expect(
      OwnerEquityService.stampCompletionMetadata(
        DS.DRAFT,
        { completedAt: AT, completedBy: 'alice' },
        'alice',
        AT,
      ),
    ).toEqual({ completedAt: null, completedBy: null });
  });

  it('leaves an already-clear non-COMPLETED row clear', () => {
    expect(
      OwnerEquityService.stampCompletionMetadata(
        DS.DRAFT,
        { completedAt: null, completedBy: null },
        'alice',
        AT,
      ),
    ).toEqual({ completedAt: null, completedBy: null });
  });
});
