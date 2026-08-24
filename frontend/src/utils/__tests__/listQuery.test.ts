import { describe, expect, it } from 'vitest'

import {
  LIST_QUERY_MAX_LEN,
  LIST_QUERY_PARAM,
  encodeListQuery,
  extractListQuery,
  currentListPath,
  forwardListQuery,
  listPathWithQuery,
  withCurrentListQuery,
  withListQuery,
} from '@/utils/listQuery'

describe('encodeListQuery', () => {
  it('returns null for an empty or bare-? search', () => {
    expect(encodeListQuery('')).toBeNull()
    expect(encodeListQuery('?')).toBeNull()
  })

  it('strips the leading ? and returns the inner query', () => {
    expect(encodeListQuery('?type=CASH_DRAWING&page=3')).toBe('type=CASH_DRAWING&page=3')
  })

  it('removes a nested listQuery key so tickets cannot recurse', () => {
    const inner = encodeListQuery('?page=2&listQuery=page%3D9&type=X')
    expect(inner).not.toBeNull()
    const parsed = new URLSearchParams(inner as string)
    expect(parsed.get(LIST_QUERY_PARAM)).toBeNull()
    expect(parsed.get('page')).toBe('2')
    expect(parsed.get('type')).toBe('X')
  })

  it('emits no ticket when the inner query exceeds the cap', () => {
    const long = `search=${'a'.repeat(LIST_QUERY_MAX_LEN + 10)}`
    expect(encodeListQuery(`?${long}`)).toBeNull()
  })

  it('treats encoded whitespace as real content, not emptiness', () => {
    const inner = encodeListQuery('?search=%20')
    expect(inner).not.toBeNull()
    expect(new URLSearchParams(inner as string).get('search')).toBe(' ')
  })
})

describe('withListQuery', () => {
  it('attaches the ticket to a bare path', () => {
    const url = withListQuery('/accounting/owner-equity/EQ-1/view', '?type=X&page=3')
    const [path, query] = url.split('?')
    expect(path).toBe('/accounting/owner-equity/EQ-1/view')
    expect(new URLSearchParams(query).get(LIST_QUERY_PARAM)).toBe('type=X&page=3')
  })

  it('returns the path unchanged when there is nothing to carry', () => {
    expect(withListQuery('/inventory/products/abc/view', '')).toBe('/inventory/products/abc/view')
  })

  it('preserves query params already on the destination', () => {
    const url = withListQuery('/inventory/stock-adjustments/7/edit?from=view', '?page=2')
    expect(url.split('?').length).toBe(2)
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('from')).toBe('view')
    expect(params.get(LIST_QUERY_PARAM)).toBe('page=2')
  })

  it('preserves a hash fragment', () => {
    const url = withListQuery('/inventory/categories/create?parentId=9#top', '?page=2')
    expect(url.endsWith('#top')).toBe(true)
    const query = url.slice(url.indexOf('?') + 1, url.indexOf('#'))
    const params = new URLSearchParams(query)
    expect(params.get('parentId')).toBe('9')
    expect(params.get(LIST_QUERY_PARAM)).toBe('page=2')
  })
})

describe('extractListQuery', () => {
  it('round-trips a ticket without double-decoding', () => {
    const inner = new URLSearchParams()
    inner.set('search', 'a#b')
    inner.set('type', 'CASH_DRAWING')
    const url = withListQuery('/x/view', `?${inner.toString()}`)
    const got = extractListQuery(url.slice(url.indexOf('?')))
    expect(new URLSearchParams(got).get('search')).toBe('a#b')
    expect(new URLSearchParams(got).get('type')).toBe('CASH_DRAWING')
  })

  it('round-trips special characters semantically', () => {
    const inner = new URLSearchParams()
    inner.set('search', '100% & more? #1 =x')
    inner.set('note', 'café')
    const url = withListQuery('/x/view', `?${inner.toString()}`)
    const got = new URLSearchParams(extractListQuery(url.slice(url.indexOf('?'))))
    expect(got.get('search')).toBe('100% & more? #1 =x')
    expect(got.get('note')).toBe('café')
  })

  it('ignores foreign detail params', () => {
    const url = withListQuery('/x/view?tab=2', '?page=3')
    const got = extractListQuery(url.slice(url.indexOf('?')))
    expect(new URLSearchParams(got).get('tab')).toBeNull()
    expect(new URLSearchParams(got).get('page')).toBe('3')
  })

  it('returns empty string when absent', () => {
    expect(extractListQuery('?tab=2')).toBe('')
    expect(extractListQuery('')).toBe('')
  })

  it('rejects an over-long ticket', () => {
    const params = new URLSearchParams()
    params.set(LIST_QUERY_PARAM, `search=${'a'.repeat(LIST_QUERY_MAX_LEN + 10)}`)
    expect(extractListQuery(`?${params.toString()}`)).toBe('')
  })
})

describe('listPathWithQuery', () => {
  it('appends a decoded ticket to the list path', () => {
    const detail = withListQuery('/x/view', '?type=X&page=3')
    const back = listPathWithQuery('/accounting/owner-equity', detail.slice(detail.indexOf('?')))
    expect(back).toBe('/accounting/owner-equity?type=X&page=3')
  })

  it('returns a clean path when there is no ticket', () => {
    expect(listPathWithQuery('/accounting/owner-equity', '?tab=1')).toBe('/accounting/owner-equity')
    expect(listPathWithQuery('/accounting/owner-equity', '')).toBe('/accounting/owner-equity')
  })
})

describe('withCurrentListQuery (live read)', () => {
  it('reads window.location.search at call time, not a stale snapshot', () => {
    window.history.replaceState(null, '', '/list')
    // Simulate the hook writing new state natively — React Router's
    // useLocation() would still report the old (empty) search here.
    window.history.replaceState(null, '', '/list?page=3&type=X')

    const url = withCurrentListQuery('/list/EQ-1/view')
    const query = new URLSearchParams(url.slice(url.indexOf('?')))
    expect(query.get(LIST_QUERY_PARAM)).toBe('page=3&type=X')
  })

  it('returns a bare path when the live URL is clean', () => {
    window.history.replaceState(null, '', '/list')
    expect(withCurrentListQuery('/list/EQ-1/view')).toBe('/list/EQ-1/view')
  })

  it('preserves destination params', () => {
    window.history.replaceState(null, '', '/list?page=2')
    const url = withCurrentListQuery('/sa/7/edit?from=view')
    expect(url.split('?').length).toBe(2)
    const q = new URLSearchParams(url.slice(url.indexOf('?')))
    expect(q.get('from')).toBe('view')
    expect(q.get(LIST_QUERY_PARAM)).toBe('page=2')
  })
})

describe('forwardListQuery (ticket-only forwarding)', () => {
  it('forwards only the ticket, never foreign detail params like tab', () => {
    window.history.replaceState(null, '', '/x/view?tab=2&listQuery=page%3D3')
    const url = forwardListQuery('/x/1/edit')
    const q = new URLSearchParams(url.slice(url.indexOf('?')))
    expect(q.get(LIST_QUERY_PARAM)).toBe('page=3')
    expect(q.get('tab')).toBeNull()
  })

  it('returns the bare path when there is no ticket', () => {
    window.history.replaceState(null, '', '/x/view?tab=2')
    expect(forwardListQuery('/x/1/edit')).toBe('/x/1/edit')
  })
})

describe('currentListPath (live return)', () => {
  it('decodes the live ticket onto the list path', () => {
    window.history.replaceState(null, '', '/x/view?listQuery=page%3D3%26type%3DX')
    expect(currentListPath('/list')).toBe('/list?page=3&type=X')
  })

  it('returns the clean list path with no ticket', () => {
    window.history.replaceState(null, '', '/x/view?tab=1')
    expect(currentListPath('/list')).toBe('/list')
  })
})
