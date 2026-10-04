import type { PickerContext, ReconciliationFormState } from './reconciliationForm'

export interface StoredDraft {
  v: 1
  lockVersion: number | null
  form: ReconciliationFormState
  picker: PickerContext
  savedAt: string
}

const DRAFT_KEY_PREFIX = 'erp:bank-reconciliation-draft:'

export function draftKey(
  userId: string,
  target: { reconciliationId: string } | { createToken: string },
): string {
  if ('reconciliationId' in target) {
    return `${DRAFT_KEY_PREFIX}${userId}:${target.reconciliationId}`
  }
  return `${DRAFT_KEY_PREFIX}${userId}:create:${target.createToken}`
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

/**
 * Remove every stored reconciliation draft, for every user, from this tab.
 *
 * A draft holds statement balances and the amounts of the selected entries.
 * The key is scoped by user id so the app never loads another user's draft,
 * but the raw value would otherwise stay readable in this tab's storage after
 * sign-out until the tab is closed.
 */
export function clearAllDrafts(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(DRAFT_KEY_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // Swallow storage failures
  }
}
