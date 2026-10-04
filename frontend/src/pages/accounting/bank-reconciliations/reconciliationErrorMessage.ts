import { rtkErrorMessage } from '@/utils/errorMessage'

/**
 * Reconciliation 409s that carry details arrive as `{ text, ...details }`
 * (`message` on the wire, unwrapped to `data` by the base query), the same
 * shape as the provider-settlement stale conflict. `rtkErrorMessage` only
 * understands string messages, so read `text` first and fall back to it.
 */
export function reconciliationErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null)?.data
  if (data && typeof data === 'object') {
    const text = (data as { text?: unknown }).text
    if (typeof text === 'string' && text.trim().length > 0) return text
  }
  return rtkErrorMessage(error, fallback)
}
