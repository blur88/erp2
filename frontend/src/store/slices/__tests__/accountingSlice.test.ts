import { describe, expect, it } from 'vitest'

import accountingReducer, {
  selectSelectedAccount,
  selectSelectedJournalEntry,
  setSelectedAccount,
  setSelectedJournalEntry,
} from '@/store/slices/accountingSlice'

describe('accountingSlice', () => {
  it('sets selectedJournalEntry', () => {
    const entry = { id: 'je-1', referenceNumber: 'JE-001' } as any
    const state = accountingReducer(undefined, setSelectedJournalEntry(entry))

    expect(state.selectedJournalEntry).toEqual(entry)
  })

  it('clears selectedJournalEntry', () => {
    const entry = { id: 'je-1', referenceNumber: 'JE-001' } as any
    const withEntry = accountingReducer(undefined, setSelectedJournalEntry(entry))
    const cleared = accountingReducer(withEntry, setSelectedJournalEntry(null))

    expect(cleared.selectedJournalEntry).toBeNull()
  })

  it('sets selectedAccount', () => {
    const account = { id: 'acc-1', code: '1000', name: 'Cash' } as any
    const state = accountingReducer(undefined, setSelectedAccount(account))

    expect(state.selectedAccount).toEqual(account)
  })

  it('clears selectedAccount', () => {
    const account = { id: 'acc-1', code: '1000', name: 'Cash' } as any
    const withAccount = accountingReducer(undefined, setSelectedAccount(account))
    const cleared = accountingReducer(withAccount, setSelectedAccount(null))

    expect(cleared.selectedAccount).toBeNull()
  })
})

describe('accountingSlice selectors - undefined state resilience', () => {
  const stateWithoutAccounting = {} as any

  it('selectSelectedJournalEntry returns undefined when accounting slice is absent', () => {
    expect(() => selectSelectedJournalEntry(stateWithoutAccounting)).not.toThrow()
    expect(selectSelectedJournalEntry(stateWithoutAccounting)).toBeUndefined()
  })

  it('selectSelectedAccount returns undefined when accounting slice is absent', () => {
    expect(() => selectSelectedAccount(stateWithoutAccounting)).not.toThrow()
    expect(selectSelectedAccount(stateWithoutAccounting)).toBeUndefined()
  })
})
