/**
 * The list "ticket": a whole list query string carried through Detail/Create/Edit
 * URLs as ONE opaque parameter, so returning to the list restores it.
 *
 * Encoding is exactly ONE layer. `URLSearchParams.set()` percent-encodes and
 * `.get()` decodes that layer, so the inner query is stored serialized-but-raw.
 * NEVER call decodeURIComponent on the result of `.get()` — a filter value
 * legitimately containing `%23` would decode to `#` and truncate the query.
 */

export const LIST_QUERY_PARAM = 'listQuery'
export const LIST_QUERY_MAX_LEN = 2000

/** Split 'path?query#hash' into its parts. */
function splitUrl(url: string): { path: string; query: string; hash: string } {
  const hashAt = url.indexOf('#')
  const hash = hashAt === -1 ? '' : url.slice(hashAt)
  const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt)
  const queryAt = withoutHash.indexOf('?')
  return {
    path: queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt),
    query: queryAt === -1 ? '' : withoutHash.slice(queryAt + 1),
    hash,
  }
}

/**
 * Build the inner ticket value from a list's own search string.
 * Returns null when there is nothing worth carrying.
 */
export function encodeListQuery(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return null

  const params = new URLSearchParams(raw)
  // A list never owns this key. Removing it stops a crafted or stale URL from
  // nesting tickets inside tickets.
  params.delete(LIST_QUERY_PARAM)

  const inner = params.toString()
  if (!inner) return null
  if (inner.length > LIST_QUERY_MAX_LEN) return null
  return inner
}

/**
 * Attach the ticket to an outbound Detail/Create/Edit URL, preserving any query
 * params and hash the destination already carries (?from=view, ?parentId=...).
 */
export function withListQuery(path: string, search: string): string {
  const inner = encodeListQuery(search)
  if (inner === null) return path

  const { path: base, query, hash } = splitUrl(path)
  const params = new URLSearchParams(query)
  params.set(LIST_QUERY_PARAM, inner)
  return `${base}?${params.toString()}${hash}`
}

/**
 * Read the ticket off the current (detail/form) search string.
 * Returns '' when absent, empty, or over the cap — callers then fall back to the
 * clean default list.
 */
export function extractListQuery(search: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return ''

  const value = new URLSearchParams(raw).get(LIST_QUERY_PARAM)
  if (!value) return ''
  if (value.length > LIST_QUERY_MAX_LEN) return ''

  // URLSearchParams is lenient and never throws, so validation IS
  // canonicalization: whatever survives the round-trip is a well-formed query.
  return new URLSearchParams(value).toString()
}

/** Build the return URL to a list from a detail/form search string. */
export function listPathWithQuery(listPath: string, search: string): string {
  const inner = extractListQuery(search)
  return inner ? `${listPath}?${inner}` : listPath
}

/**
 * Build an outbound Detail/Create/Edit URL from the list's LIVE query string.
 *
 * Use this instead of `withListQuery(path, location.search)` at every
 * list-origin navigation. `useListUrlState` and `useFilterBar` write the URL
 * with native `window.history.replaceState`, which updates `window.location`
 * but does NOT notify React Router — so `useLocation().search` still reports the
 * query as it was at mount. Building a ticket from that stale value yields the
 * initial query (usually empty) rather than the list state the user can see.
 */
export function withCurrentListQuery(path: string): string {
  return withListQuery(path, window.location.search)
}

/**
 * Forward an existing ticket from a Detail/Form page to another Detail/Edit URL.
 *
 * Reads the ticket off the live URL and re-attaches ONLY that — never the whole
 * detail search, which carries page-owned params such as `tab`.
 */
export function forwardListQuery(path: string): string {
  const inner = extractListQuery(window.location.search)
  return withListQuery(path, inner ? `?${inner}` : '')
}

/** Build the return URL to a list from the LIVE detail/form URL. */
export function currentListPath(listPath: string): string {
  return listPathWithQuery(listPath, window.location.search)
}
