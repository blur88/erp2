import { listPathWithQuery } from '@/utils/listQuery'

/**
 * Marks which list a Journal Entry detail page was opened from.
 *
 * `withCurrentListQuery` carries only the opaque list ticket; the return PATH
 * is hard-coded at the consumer. Without this marker a General Ledger visit
 * returns to Journal Entries carrying GL's filters — the wrong list, with
 * `account` silently ignored.
 *
 * It lives in the URL rather than router state so it survives a refresh and a
 * directly pasted link. Note this is a different guarantee from browser Back,
 * which already restores the previous GL URL from history.
 */
export const JOURNAL_ENTRY_ORIGIN_PARAM = 'from'

const JOURNAL_ENTRIES_LIST = '/accounting/journal-entries'

/**
 * Closed origin -> list path map. The parameter selects an ENTRY; it never
 * names a destination, so a crafted value cannot redirect anywhere. Adding a
 * third origin is a new entry here, not a new branch at the call site.
 */
const ORIGIN_LIST_PATHS: Record<string, string> = {
  'general-ledger': '/accounting/general-ledger',
}

/**
 * Resolve the Back destination for a Journal Entry detail page.
 *
 * Takes the search string explicitly (the caller passes React Router's
 * `location.search`) rather than reading `window.location` itself, so it stays
 * a pure function and is directly testable.
 */
export function journalEntryListPath(search: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const origin = new URLSearchParams(raw).get(JOURNAL_ENTRY_ORIGIN_PARAM)
  const listPath = (origin && ORIGIN_LIST_PATHS[origin]) || JOURNAL_ENTRIES_LIST
  return listPathWithQuery(listPath, search)
}