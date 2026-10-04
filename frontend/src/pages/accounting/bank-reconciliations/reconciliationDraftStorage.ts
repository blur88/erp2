import type { PickerContext, ReconciliationFormState } from './reconciliationForm'

export interface StoredDraft {
  v: 1
  lockVersion: number | null
  form: ReconciliationFormState
  picker: PickerContext
  savedAt: string
}

export function draftKey(
  userId: string,
  target: { reconciliationId: string } | { createToken: string },
): string {
  if ('reconciliationId' in target) {
    return `erp:bank-reconciliation-draft:${userId}:${target.reconciliationId}`
  }
  return `erp:bank-reconciliation-draft:${userId}:create:${target.createToken}`
}

export function saveDraft(key: string, draft: StoredDraft): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Swallow storage failures (e.g. quota exceeded)
  }
}

export function loadDraft(key: string): StoredDraft | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) return null
    return parsed as StoredDraft
  } catch {
    return null
  }
}

export function clearDraft(key: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(key)
  } catch {
    // Swallow storage failures
  }
}

export function newCreateToken(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
