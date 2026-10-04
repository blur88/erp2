import { ConflictException, BadRequestException } from '@nestjs/common';
import {
  resolveFinalState,
  mapReconciliationDbError,
  validateSequenceInputs,
  LOCK_VERSION_MISMATCH_TEXT,
  SavedLineState,
} from '../bank-reconciliation.rules';
import { SetupClassification } from '../../entities/bank-reconciliation.entity';

describe('BankReconciliationService decision points', () => {
  const line1 = '11111111-1111-4111-8111-111111111111';
  const line2 = '22222222-2222-4222-8222-222222222222';
  const line3 = '33333333-3333-4333-8333-333333333333';

  describe('resolveFinalState', () => {
    it('handles saved empty, ticking line1 -> matched true, classification UNCLASSIFIED, targetKind MATCHED, targetMark false', () => {
      const saved: SavedLineState[] = [];
      const res = resolveFinalState(saved, [line1], []);
      const s = res.get(line1);
      expect(s).toEqual({
        journalEntryLineId: line1,
        matched: true,
        classification: SetupClassification.UNCLASSIFIED,
        targetKind: 'MATCHED',
        targetMark: false,
      });
    });

    it('handles saved MATCHED line without mark -> request un-ticks it -> line removed (targetKind null)', () => {
      const saved: SavedLineState[] = [{ journalEntryLineId: line1, kind: 'MATCHED', marked: false }];
      const res = resolveFinalState(saved, [], []);
      const s = res.get(line1);
      expect(s).toEqual({
        journalEntryLineId: line1,
        matched: false,
        classification: SetupClassification.UNCLASSIFIED,
        targetKind: null,
        targetMark: false,
      });
    });

    it('one save turns an Already cleared line into Outstanding and ticked', () => {
      // before: OPENING_CLEARED line, no mark. request: matchedLineIds [L], setupChanges [{L, OUTSTANDING}]
      // after: exactly one line (kind MATCHED) and one mark for L
      const saved: SavedLineState[] = [{ journalEntryLineId: line1, kind: 'OPENING_CLEARED', marked: false }];
      const res = resolveFinalState(saved, [line1], [{ journalEntryLineId: line1, classification: SetupClassification.OUTSTANDING }]);
      const s = res.get(line1);
      expect(s).toEqual({
        journalEntryLineId: line1,
        matched: true,
        classification: SetupClassification.OUTSTANDING,
        targetKind: 'MATCHED',
        targetMark: true,
      });
    });

    it('one save turns an Outstanding ticked line into Already cleared and unticked', () => {
      // before: MATCHED line + mark. request: matchedLineIds [], setupChanges [{L, CLEARED}]
      // after: exactly one line (kind OPENING_CLEARED) and no mark
      const saved: SavedLineState[] = [{ journalEntryLineId: line1, kind: 'MATCHED', marked: true }];
      const res = resolveFinalState(saved, [], [{ journalEntryLineId: line1, classification: SetupClassification.CLEARED }]);
      const s = res.get(line1);
      expect(s).toEqual({
        journalEntryLineId: line1,
        matched: false,
        classification: SetupClassification.CLEARED,
        targetKind: 'OPENING_CLEARED',
        targetMark: false,
      });
    });

    it('keeps setup mark when an OUTSTANDING line is ticked', () => {
      const saved: SavedLineState[] = [{ journalEntryLineId: line1, kind: null, marked: true }];
      const res = resolveFinalState(saved, [line1], []);
      const s = res.get(line1);
      expect(s).toEqual({
        journalEntryLineId: line1,
        matched: true,
        classification: SetupClassification.OUTSTANDING,
        targetKind: 'MATCHED',
        targetMark: true,
      });
    });

    it('rejects a final state that is both ticked and Already cleared (409)', () => {
      const saved: SavedLineState[] = [{ journalEntryLineId: line1, kind: 'OPENING_CLEARED', marked: false }];
      expect(() => {
        resolveFinalState(saved, [line1], []); // ticked without reclassifying
      }).toThrow(ConflictException);

      expect(() => {
        resolveFinalState([], [line1], [{ journalEntryLineId: line1, classification: SetupClassification.CLEARED }]);
      }).toThrow('An entry marked Already cleared cannot be ticked. Change its classification first.');
    });

    it('rejects duplicate journalEntryLineId in setupChanges (409)', () => {
      expect(() => {
        resolveFinalState([], [], [
          { journalEntryLineId: line1, classification: SetupClassification.CLEARED },
          { journalEntryLineId: line1, classification: SetupClassification.OUTSTANDING },
        ]);
      }).toThrow(ConflictException);
    });

    it('leaves matched state untouched when matchedLineIds is omitted', () => {
      const saved: SavedLineState[] = [{ journalEntryLineId: line1, kind: 'MATCHED', marked: false }];
      const res = resolveFinalState(saved, undefined, []);
      const s = res.get(line1);
      expect(s?.matched).toBe(true);
      expect(s?.targetKind).toBe('MATCHED');
    });

    it('applies UNCLASSIFIED setup change to remove mark', () => {
      const saved: SavedLineState[] = [{ journalEntryLineId: line1, kind: null, marked: true }];
      const res = resolveFinalState(saved, [], [{ journalEntryLineId: line1, classification: SetupClassification.UNCLASSIFIED }]);
      const s = res.get(line1);
      expect(s).toEqual({
        journalEntryLineId: line1,
        matched: false,
        classification: SetupClassification.UNCLASSIFIED,
        targetKind: null,
        targetMark: false,
      });
    });
  });

  describe('23505 and deadlock error mapping', () => {
    it('maps UQ_bsr_one_draft_per_account to 409', () => {
      expect(() => {
        mapReconciliationDbError({ code: '23505', constraint: 'UQ_bsr_one_draft_per_account' });
      }).toThrow('A draft reconciliation already exists for this bank account.');
    });

    it('maps UQ_bsr_account_sequence to 409', () => {
      expect(() => {
        mapReconciliationDbError({ code: '23505', constraint: 'UQ_bsr_account_sequence' });
      }).toThrow('Another reconciliation was created for this bank account. Reload and try again.');
    });

    it('maps UQ_bsr_line_journal_line to 409', () => {
      expect(() => {
        mapReconciliationDbError({ code: '23505', constraint: 'UQ_bsr_line_journal_line' });
      }).toThrow('One or more selected entries are already reconciled elsewhere.');
    });

    it('maps deadlock 40P01 to 409', () => {
      expect(() => {
        mapReconciliationDbError({ code: '40P01' });
      }).toThrow(ConflictException);
    });

    it('re-throws other unexpected errors', () => {
      const generic = new Error('unexpected');
      expect(() => {
        mapReconciliationDbError(generic);
      }).toThrow(generic);
    });
  });

  describe('lockVersion mismatch', () => {
    it('has exact expected message', () => {
      expect(LOCK_VERSION_MISMATCH_TEXT).toBe('This reconciliation was changed by someone else. Reload to continue.');
    });
  });

  describe('sequence > 1 input validation', () => {
    it('rejects periodFrom on sequence > 1', () => {
      expect(() => {
        validateSequenceInputs(2, { periodFrom: '2026-02-01' });
      }).toThrow(BadRequestException);
    });

    it('rejects openingBalance on sequence > 1', () => {
      expect(() => {
        validateSequenceInputs(2, { openingBalance: '100.00' });
      }).toThrow(BadRequestException);
    });

    it('rejects setupChanges on sequence > 1', () => {
      expect(() => {
        validateSequenceInputs(2, {
          setupChanges: [{ journalEntryLineId: line1, classification: SetupClassification.CLEARED }],
        });
      }).toThrow(BadRequestException);
    });

    it('allows valid inputs on sequence 1', () => {
      expect(() => {
        validateSequenceInputs(1, {
          periodFrom: '2026-01-01',
          openingBalance: '100.00',
          setupChanges: [{ journalEntryLineId: line1, classification: SetupClassification.CLEARED }],
        });
      }).not.toThrow();
    });
  });
});
