import { describe, expect, it } from 'vitest'

import { journalEntryListPath, JOURNAL_ENTRY_ORIGIN_PARAM } from '../journal-entry-navigation'

describe('journalEntryListPath', () => {
  it('returns the Journal Entries list when no origin is given', () => {
    expect(journalEntryListPath('')).toBe('/accounting/journal-entries')
  })

  it('returns the General Ledger list for the general-ledger origin', () => {
    expect(journalEntryListPath('?from=general-ledger')).toBe('/accounting/general-ledger')
  })

  it('restores the list ticket alongside the resolved origin', () => {
    const search = `?${JOURNAL_ENTRY_ORIGIN_PARAM}=general-ledger&listQuery=${encodeURIComponent('account=a1&page=3')}`
    expect(journalEntryListPath(search)).toBe('/accounting/general-ledger?account=a1&page=3')
  })

  it('falls back to Journal Entries for an unknown origin', () => {
    expect(journalEntryListPath('?from=nowhere')).toBe('/accounting/journal-entries')
  })

  it('never treats the origin value as a destination path', () => {
    expect(journalEntryListPath('?from=https://evil.example.com')).toBe(
      '/accounting/journal-entries',
    )
    expect(journalEntryListPath('?from=//evil.example.com')).toBe('/accounting/journal-entries')
    expect(journalEntryListPath('?from=/settings/users')).toBe('/accounting/journal-entries')
  })
})