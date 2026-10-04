import { describe, expect, it } from 'vitest'
import type { BankReconciliationDetailDto, PreviewResultDto, ReconciliationLineDto } from '@/types'
import {
  applyPreview,
  clearClassification,
  effectiveClassification,
  emptyForm,
  fromDetail,
  isDirty,
  previewTotals,
  setClassification,
  toCreateBody,
  toggleMatched,
  toUpdateBody,
  untickMatched,
  type ReconciliationFormState,
} from '../reconciliationForm'

function makeLine(over: Partial<ReconciliationLineDto> = {}): ReconciliationLineDto {
  return {
    journalEntryLineId: 'jel-1',
    journalEntryId: 'je-1',
    entryDate: '2026-01-15',
    journalNo: 'JE-001',
    sourceType: 'EXPENSE',
    sourceDocumentId: null,
    sourceRef: null,
    description: 'Test line',
    moneyIn: '50.00',
    moneyOut: '0.00',
    role: 'OUTSTANDING',
    prePeriod: false,
    classification: null,
    ...over,
  }
}

describe('reconciliationForm', () => {
  it('toggleMatched adds a line with its amounts and removes it on the second toggle', () => {
    let state = emptyForm()
    const line = makeLine({ journalEntryLineId: 'jel-1', moneyIn: '25.00', moneyOut: '0.00' })

    state = toggleMatched(state, line)
    expect(state.matched['jel-1']).toEqual({ moneyIn: '25.00', moneyOut: '0.00' })

    state = toggleMatched(state, line)
    expect(state.matched['jel-1']).toBeUndefined()
  })

  it('untickMatched removes line from matched', () => {
    let state = emptyForm()
    const line = makeLine({ journalEntryLineId: 'jel-1' })
    state = toggleMatched(state, line)
    expect(state.matched['jel-1']).toBeDefined()

    state = untickMatched(state, 'jel-1')
    expect(state.matched['jel-1']).toBeUndefined()
  })

  it('previewTotals sums cent strings: opening 100.00 + in 0.01 + 0.01 − out 0.00 → 100.02', () => {
    let state: ReconciliationFormState = {
      ...emptyForm(),
      openingBalance: '100.00',
      closingBalance: '100.02',
    }
    state = toggleMatched(state, makeLine({ journalEntryLineId: 'l1', moneyIn: '0.01', moneyOut: '0.00' }))
    state = toggleMatched(state, makeLine({ journalEntryLineId: 'l2', moneyIn: '0.01', moneyOut: '0.00' }))

    const totals = previewTotals(state)
    expect(totals).not.toBeNull()
    expect(totals?.moneyIn).toBe('0.02')
    expect(totals?.moneyOut).toBe('0.00')
    expect(totals?.calculatedClosingBalance).toBe('100.02')
    expect(totals?.difference).toBe('0.00')
  })

  it('previewTotals never returns -0.00 and returns null for an unparseable balance', () => {
    const validState: ReconciliationFormState = {
      ...emptyForm(),
      openingBalance: '100.00',
      closingBalance: '100.00',
    }
    const totals = previewTotals(validState)
    expect(totals?.difference).toBe('0.00')
    expect(totals?.difference).not.toContain('-')

    const invalidState: ReconciliationFormState = {
      ...emptyForm(),
      openingBalance: 'invalid',
      closingBalance: '100.00',
    }
    expect(previewTotals(invalidState)).toBeNull()
  })

  it('setClassification on an Unclassified line records the choice', () => {
    let state = emptyForm()
    state = setClassification(state, 'jel-1', 'CLEARED', 'UNCLASSIFIED')
    expect(state.setupChanges['jel-1']).toBe('CLEARED')
    expect(effectiveClassification(state, 'jel-1', 'UNCLASSIFIED')).toBe('CLEARED')
  })

  it('choosing the active classification again returns the line to Unclassified', () => {
    let state = emptyForm()
    state = setClassification(state, 'jel-1', 'CLEARED', 'UNCLASSIFIED')
    expect(state.setupChanges['jel-1']).toBe('CLEARED')

    state = setClassification(state, 'jel-1', 'CLEARED', 'UNCLASSIFIED')
    expect(effectiveClassification(state, 'jel-1', 'UNCLASSIFIED')).toBe('UNCLASSIFIED')
    // Since saved is UNCLASSIFIED, reverting to UNCLASSIFIED removes the entry from setupChanges
    expect(state.setupChanges['jel-1']).toBeUndefined()
  })

  it('clearClassification of a saved CLEARED line records UNCLASSIFIED; of an unsaved choice removes the change', () => {
    let state = emptyForm()
    // Saved was CLEARED, clear records UNCLASSIFIED
    state = clearClassification(state, 'jel-saved', 'CLEARED')
    expect(state.setupChanges['jel-saved']).toBe('UNCLASSIFIED')
    expect(effectiveClassification(state, 'jel-saved', 'CLEARED')).toBe('UNCLASSIFIED')

    // Saved was UNCLASSIFIED, but we had unsaved choice CLEARED
    state = setClassification(state, 'jel-temp', 'CLEARED', 'UNCLASSIFIED')
    expect(state.setupChanges['jel-temp']).toBe('CLEARED')
    state = clearClassification(state, 'jel-temp', 'UNCLASSIFIED')
    expect(state.setupChanges['jel-temp']).toBeUndefined()
    expect(effectiveClassification(state, 'jel-temp', 'UNCLASSIFIED')).toBe('UNCLASSIFIED')
  })

  it('toUpdateBody keeps matched and setup payloads separate and sorted', () => {
    let state = emptyForm()
    state = toggleMatched(state, makeLine({ journalEntryLineId: 'z-line' }))
    state = toggleMatched(state, makeLine({ journalEntryLineId: 'a-line' }))
    state = setClassification(state, 'y-setup', 'CLEARED', 'UNCLASSIFIED')
    state = setClassification(state, 'b-setup', 'OUTSTANDING', 'UNCLASSIFIED')

    const body = toUpdateBody(state, 2, true)
    expect(body.lockVersion).toBe(2)
    expect(body.matchedLineIds).toEqual(['a-line', 'z-line'])
    expect(body.setupChanges).toEqual([
      { journalEntryLineId: 'b-setup', classification: 'OUTSTANDING' },
      { journalEntryLineId: 'y-setup', classification: 'CLEARED' },
    ])
  })

  it('toCreateBody omits periodFrom and openingBalance when not first', () => {
    const state: ReconciliationFormState = {
      bankAccountId: 'ba-1',
      periodFrom: '2026-02-01',
      periodTo: '2026-02-28',
      openingBalance: '500.00',
      closingBalance: '750.00',
      matched: {},
      setupChanges: {},
    }

    const firstBody = toCreateBody(state, true)
    expect(firstBody.periodFrom).toBe('2026-02-01')
    expect(firstBody.openingBalance).toBe('500.00')

    const nextBody = toCreateBody(state, false)
    expect(nextBody.periodFrom).toBeUndefined()
    expect(nextBody.openingBalance).toBeUndefined()
    expect(nextBody.periodTo).toBe('2026-02-28')
    expect(nextBody.closingBalance).toBe('750.00')
  })

  it('applyPreview refreshes amounts and keeps invalid ids selected', () => {
    let state = emptyForm()
    state = toggleMatched(state, makeLine({ journalEntryLineId: 'l1', moneyIn: '10.00', moneyOut: '0.00' }))
    state = toggleMatched(state, makeLine({ journalEntryLineId: 'l2', moneyIn: '20.00', moneyOut: '0.00' }))

    const preview: PreviewResultDto = {
      matched: [
        makeLine({ journalEntryLineId: 'l1', moneyIn: '15.00', moneyOut: '0.00' }), // amount changed
      ],
      invalidMatched: [
        makeLine({ journalEntryLineId: 'l2', moneyIn: '20.00', moneyOut: '0.00' }), // now invalid
      ],
      invalidClassifications: [],
      setupSummary: null,
    }

    const applied = applyPreview(state, preview)
    expect(applied.matched['l1']).toEqual({ moneyIn: '15.00', moneyOut: '0.00' })
    expect(applied.matched['l2']).toEqual({ moneyIn: '20.00', moneyOut: '0.00' })
  })

  it('applyPreview returns the same state object when no amount changed', () => {
    let state = emptyForm()
    state = toggleMatched(state, makeLine({ journalEntryLineId: 'l1', moneyIn: '10.00', moneyOut: '0.00' }))

    const preview: PreviewResultDto = {
      matched: [makeLine({ journalEntryLineId: 'l1', moneyIn: '10.00', moneyOut: '0.00' })],
      invalidMatched: [],
      invalidClassifications: [],
      setupSummary: null,
    }

    // Identity, not equality: the form page compares `matched` by reference to
    // decide whether to preview again, so a fresh-but-equal object loops forever.
    const applied = applyPreview(state, preview)
    expect(applied).toBe(state)
    expect(applied.matched).toBe(state.matched)
  })

  it('applyPreview never adds a line that is not already selected', () => {
    const state = emptyForm()
    const preview: PreviewResultDto = {
      matched: [makeLine({ journalEntryLineId: 'l9', moneyIn: '10.00', moneyOut: '0.00' })],
      invalidMatched: [],
      invalidClassifications: [],
      setupSummary: null,
    }
    expect(applyPreview(state, preview)).toBe(state)
  })

  it('fromDetail populates state from BankReconciliationDetailDto', () => {
    const detail: BankReconciliationDetailDto = {
      id: 'r-1',
      reconciliationNo: 'BR-01',
      sequenceNo: 1,
      bankAccountId: 'ba-1',
      bankAccount: { code: '100', name: 'Bank', isActive: true, isBankAccount: true },
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
      status: 'DRAFT',
      reopened: false,
      currentVersionNo: null,
      lockVersion: 1,
      completedAt: null,
      completedBy: null,
      isLatest: true,
      accountHasDraft: false,
      summary: {
        openingBalance: '100.00',
        closingBalance: '200.00',
        moneyIn: '100.00',
        moneyOut: '0.00',
        calculatedClosingBalance: '200.00',
        difference: '0.00',
        openingClearedNet: null,
        openingBalanceDifference: null,
        unclassifiedCount: null,
      },
      matched: [makeLine({ journalEntryLineId: 'l1', moneyIn: '100.00', moneyOut: '0.00' })],
      classified: [],
    }

    const state = fromDetail(detail)
    expect(state.bankAccountId).toBe('ba-1')
    expect(state.periodFrom).toBe('2026-01-01')
    expect(state.periodTo).toBe('2026-01-31')
    expect(state.openingBalance).toBe('100.00')
    expect(state.closingBalance).toBe('200.00')
    expect(state.matched['l1']).toEqual({ moneyIn: '100.00', moneyOut: '0.00' })
    expect(state.setupChanges).toEqual({})
  })

  it('isDirty detects changes against baseline', () => {
    const baseline = emptyForm()
    expect(isDirty(baseline, baseline)).toBe(false)

    expect(isDirty({ ...baseline, closingBalance: '10.00' }, baseline)).toBe(true)
    expect(
      isDirty(
        toggleMatched(baseline, makeLine({ journalEntryLineId: 'l1' })),
        baseline,
      ),
    ).toBe(true)
    expect(
      isDirty(
        setClassification(baseline, 'l1', 'CLEARED', 'UNCLASSIFIED'),
        baseline,
      ),
    ).toBe(true)
  })
})
