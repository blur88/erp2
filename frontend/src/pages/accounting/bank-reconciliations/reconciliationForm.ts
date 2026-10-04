import type {
  BankReconciliationDetailDto,
  PreviewResultDto,
  ReconciliationLineDto,
  SetupClassification,
} from '@/types'
import type {
  CreateBankReconciliationBody,
  UpdateBankReconciliationBody,
} from '@/store/api/accountingApi'
import { formatMoney, toScaledAmount } from '@/utils/currency'

export interface ReconciliationFormState {
  bankAccountId: string
  periodFrom: string
  periodTo: string
  openingBalance: string
  closingBalance: string
  matched: Record<string, { moneyIn: string; moneyOut: string }>
  setupChanges: Record<string, SetupClassification>
}

export interface PickerContext {
  checklist: { page: number; search: string }
  setup: { page: number; search: string; filter: SetupClassification | 'ALL' }
}

export function emptyForm(): ReconciliationFormState {
  return {
    bankAccountId: '',
    periodFrom: '',
    periodTo: '',
    openingBalance: '',
    closingBalance: '',
    matched: {},
    setupChanges: {},
  }
}

export function fromDetail(d: BankReconciliationDetailDto): ReconciliationFormState {
  const matched: Record<string, { moneyIn: string; moneyOut: string }> = {}
  for (const line of d.matched ?? []) {
    matched[line.journalEntryLineId] = {
      moneyIn: line.moneyIn,
      moneyOut: line.moneyOut,
    }
  }
  return {
    bankAccountId: d.bankAccountId,
    periodFrom: d.periodFrom,
    periodTo: d.periodTo,
    openingBalance: d.summary.openingBalance,
    closingBalance: d.summary.closingBalance,
    matched,
    setupChanges: {},
  }
}

export function toggleMatched(
  s: ReconciliationFormState,
  line: ReconciliationLineDto,
): ReconciliationFormState {
  const nextMatched = { ...s.matched }
  if (nextMatched[line.journalEntryLineId]) {
    delete nextMatched[line.journalEntryLineId]
  } else {
    nextMatched[line.journalEntryLineId] = {
      moneyIn: line.moneyIn,
      moneyOut: line.moneyOut,
    }
  }
  return { ...s, matched: nextMatched }
}

export function untickMatched(
  s: ReconciliationFormState,
  journalEntryLineId: string,
): ReconciliationFormState {
  if (!s.matched[journalEntryLineId]) return s
  const nextMatched = { ...s.matched }
  delete nextMatched[journalEntryLineId]
  return { ...s, matched: nextMatched }
}

export function effectiveClassification(
  s: ReconciliationFormState,
  journalEntryLineId: string,
  saved: SetupClassification,
): SetupClassification {
  return s.setupChanges[journalEntryLineId] ?? saved
}

export function setClassification(
  s: ReconciliationFormState,
  journalEntryLineId: string,
  next: 'CLEARED' | 'OUTSTANDING',
  saved: SetupClassification,
): ReconciliationFormState {
  const current = effectiveClassification(s, journalEntryLineId, saved)
  const target: SetupClassification = current === next ? 'UNCLASSIFIED' : next
  const nextSetupChanges = { ...s.setupChanges }
  if (target === saved) {
    delete nextSetupChanges[journalEntryLineId]
  } else {
    nextSetupChanges[journalEntryLineId] = target
  }
  return { ...s, setupChanges: nextSetupChanges }
}

export function clearClassification(
  s: ReconciliationFormState,
  journalEntryLineId: string,
  saved: SetupClassification,
): ReconciliationFormState {
  const target: SetupClassification = 'UNCLASSIFIED'
  const nextSetupChanges = { ...s.setupChanges }
  if (target === saved) {
    delete nextSetupChanges[journalEntryLineId]
  } else {
    nextSetupChanges[journalEntryLineId] = target
  }
  return { ...s, setupChanges: nextSetupChanges }
}

export function previewTotals(s: ReconciliationFormState): {
  moneyIn: string
  moneyOut: string
  calculatedClosingBalance: string
  difference: string
} | null {
  const opening = toScaledAmount(s.openingBalance)
  const closing = toScaledAmount(s.closingBalance)
  if (opening === null || closing === null) return null

  let totalIn = 0n
  let totalOut = 0n
  for (const item of Object.values(s.matched)) {
    const inAmt = toScaledAmount(item.moneyIn)
    const outAmt = toScaledAmount(item.moneyOut)
    if (inAmt !== null) totalIn += inAmt
    if (outAmt !== null) totalOut += outAmt
  }

  const calculated = opening + totalIn - totalOut
  const diff = closing - calculated

  return {
    moneyIn: formatMoney(totalIn),
    moneyOut: formatMoney(totalOut),
    calculatedClosingBalance: formatMoney(calculated),
    difference: formatMoney(diff),
  }
}

/**
 * Refresh the amounts of lines that are already selected. Never adds or removes
 * a selection.
 *
 * Returns `s` itself when no amount changed. The form page decides whether to
 * preview again by comparing `matched` by reference, so returning a fresh but
 * equal object made every successful preview schedule another one, forever.
 */
export function applyPreview(
  s: ReconciliationFormState,
  p: PreviewResultDto,
): ReconciliationFormState {
  let nextMatched: ReconciliationFormState['matched'] | null = null
  for (const line of p.matched) {
    const current = s.matched[line.journalEntryLineId]
    if (!current) continue
    if (current.moneyIn === line.moneyIn && current.moneyOut === line.moneyOut) continue
    nextMatched ??= { ...s.matched }
    nextMatched[line.journalEntryLineId] = { moneyIn: line.moneyIn, moneyOut: line.moneyOut }
  }
  return nextMatched ? { ...s, matched: nextMatched } : s
}

export function toCreateBody(
  s: ReconciliationFormState,
  isFirst: boolean,
): CreateBankReconciliationBody {
  const matchedLineIds = Object.keys(s.matched).sort()
  const setupChanges = Object.entries(s.setupChanges)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([journalEntryLineId, classification]) => ({
      journalEntryLineId,
      classification,
    }))

  const body: CreateBankReconciliationBody = {
    bankAccountId: s.bankAccountId,
    periodTo: s.periodTo,
    closingBalance: s.closingBalance,
    matchedLineIds,
    ...(setupChanges.length > 0 ? { setupChanges } : {}),
  }
  if (isFirst) {
    body.periodFrom = s.periodFrom
    body.openingBalance = s.openingBalance
  }
  return body
}

export function toUpdateBody(
  s: ReconciliationFormState,
  lockVersion: number,
  isFirst: boolean,
): UpdateBankReconciliationBody {
  const matchedLineIds = Object.keys(s.matched).sort()
  const setupChanges = Object.entries(s.setupChanges)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([journalEntryLineId, classification]) => ({
      journalEntryLineId,
      classification,
    }))

  const body: UpdateBankReconciliationBody = {
    lockVersion,
    periodTo: s.periodTo,
    closingBalance: s.closingBalance,
    matchedLineIds,
    ...(setupChanges.length > 0 ? { setupChanges } : {}),
  }
  if (isFirst) {
    body.periodFrom = s.periodFrom
    body.openingBalance = s.openingBalance
  }
  return body
}

export function isDirty(s: ReconciliationFormState, baseline: ReconciliationFormState): boolean {
  if (
    s.bankAccountId !== baseline.bankAccountId ||
    s.periodFrom !== baseline.periodFrom ||
    s.periodTo !== baseline.periodTo ||
    s.openingBalance !== baseline.openingBalance ||
    s.closingBalance !== baseline.closingBalance
  ) {
    return true
  }

  const sMatchedKeys = Object.keys(s.matched).sort()
  const bMatchedKeys = Object.keys(baseline.matched).sort()
  if (sMatchedKeys.length !== bMatchedKeys.length) return true
  for (let i = 0; i < sMatchedKeys.length; i++) {
    if (sMatchedKeys[i] !== bMatchedKeys[i]) return true
    const k = sMatchedKeys[i]
    if (
      s.matched[k].moneyIn !== baseline.matched[k]?.moneyIn ||
      s.matched[k].moneyOut !== baseline.matched[k]?.moneyOut
    ) {
      return true
    }
  }

  const sSetupKeys = Object.keys(s.setupChanges).sort()
  const bSetupKeys = Object.keys(baseline.setupChanges).sort()
  if (sSetupKeys.length !== bSetupKeys.length) return true
  for (let i = 0; i < sSetupKeys.length; i++) {
    if (sSetupKeys[i] !== bSetupKeys[i]) return true
    const k = sSetupKeys[i]
    if (s.setupChanges[k] !== baseline.setupChanges[k]) return true
  }

  return false
}
