const MAX_RECENT = 8

export interface RecentSearchItem {
  label: string
  description?: string
  route: string
  type:
    | 'page'
    | 'customer'
    | 'product'
    | 'transaction'
    | 'supplier'
    | 'customer_payment'
    | 'vendor_payment'
    | 'journal_entry'
  timestamp: number
}

const storageKey = (userId: string) => `global_search_recent_${userId}`

export function getRecentSearches(userId: string): RecentSearchItem[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as RecentSearchItem[]
  } catch {
    return []
  }
}

export function addRecentSearch(
  userId: string,
  item: Omit<RecentSearchItem, 'timestamp'>,
): void {
  try {
    const current = getRecentSearches(userId)
    const deduped = current.filter((entry) => entry.route !== item.route)
    const updated = [{ ...item, timestamp: Date.now() }, ...deduped].slice(
      0,
      MAX_RECENT,
    )

    localStorage.setItem(storageKey(userId), JSON.stringify(updated))
  } catch {
    // Swallow storage failures so the search UX still works.
  }
}

export function clearRecentSearches(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // Swallow storage failures so the search UX still works.
  }
}
