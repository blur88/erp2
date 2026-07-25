// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  type RecentSearchItem,
} from './recentSearch'

const USER_ID = 'user-123'
const KEY = `global_search_recent_${USER_ID}`

function makeItem(
  route: string,
  label = 'Label',
): Omit<RecentSearchItem, 'timestamp'> {
  return { label, description: 'Desc', route, type: 'customer' }
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('getRecentSearches', () => {
  it('returns [] when nothing stored', () => {
    expect(getRecentSearches(USER_ID)).toEqual([])
  })

  it('returns [] when stored value is valid JSON but not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ label: 'oops' }))

    expect(getRecentSearches(USER_ID)).toEqual([])
  })

  it('returns stored items in the order they were persisted', () => {
    const items: RecentSearchItem[] = [
      {
        label: 'A',
        route: '/a',
        type: 'customer',
        description: 'Desc A',
        timestamp: 2000,
      },
      {
        label: 'B',
        route: '/b',
        type: 'product',
        description: 'Desc B',
        timestamp: 1000,
      },
    ]
    localStorage.setItem(KEY, JSON.stringify(items))

    expect(getRecentSearches(USER_ID)).toEqual(items)
  })

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(KEY, 'not-json')

    expect(getRecentSearches(USER_ID)).toEqual([])
  })

  it('returns [] when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage error')
    })

    expect(getRecentSearches(USER_ID)).toEqual([])
  })
})

it('drops stored vendor_payment entries no longer supported', () => {
  localStorage.setItem(
    'global_search_recent_u1',
    JSON.stringify([
      { label: 'VP-001', route: '/purchasing/vendor-payments/x', type: 'vendor_payment', timestamp: 1 },
      { label: 'Acme', route: '/sales/customers/acme', type: 'customer', timestamp: 2 },
    ]),
  )

  const result = getRecentSearches('u1')

  expect(result).toHaveLength(1)
  expect(result[0].type).toBe('customer')
})

describe('addRecentSearch', () => {
  it('prepends new item', () => {
    addRecentSearch(USER_ID, makeItem('/new'))

    const result = getRecentSearches(USER_ID)

    expect(result[0].route).toBe('/new')
  })

  it('deduplicates by route and moves existing item to front', () => {
    addRecentSearch(USER_ID, makeItem('/a', 'First'))
    addRecentSearch(USER_ID, makeItem('/b', 'Second'))
    addRecentSearch(USER_ID, makeItem('/a', 'First Again'))

    const result = getRecentSearches(USER_ID)

    expect(result[0].route).toBe('/a')
    expect(result[0].label).toBe('First Again')
    expect(result.filter((entry) => entry.route === '/a')).toHaveLength(1)
  })

  it('caps list at 8 items', () => {
    for (let i = 0; i < 10; i += 1) {
      addRecentSearch(USER_ID, makeItem(`/route-${i}`))
    }

    expect(getRecentSearches(USER_ID)).toHaveLength(8)
  })

  it('does not throw when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => addRecentSearch(USER_ID, makeItem('/x'))).not.toThrow()
  })
})

describe('clearRecentSearches', () => {
  it('removes all items for the user', () => {
    addRecentSearch(USER_ID, makeItem('/a'))

    clearRecentSearches(USER_ID)

    expect(getRecentSearches(USER_ID)).toEqual([])
  })

  it('only clears the correct user namespace', () => {
    addRecentSearch('other-user', makeItem('/a'))

    clearRecentSearches(USER_ID)

    expect(getRecentSearches('other-user')).toHaveLength(1)
  })

  it('does not throw when localStorage.removeItem throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage error')
    })

    expect(() => clearRecentSearches(USER_ID)).not.toThrow()
  })
})
