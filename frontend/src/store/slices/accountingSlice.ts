import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { ChartOfAccount, JournalEntry } from '@/types'

interface AccountingState {
  selectedJournalEntry: JournalEntry | null
  selectedAccount: ChartOfAccount | null
}

const initialState: AccountingState = {
  selectedJournalEntry: null,
  selectedAccount: null,
}

const accountingSlice = createSlice({
  name: 'accounting',
  initialState,
  reducers: {
    setSelectedJournalEntry: (state, action: PayloadAction<JournalEntry | null>) => {
      state.selectedJournalEntry = action.payload
    },
    setSelectedAccount: (state, action: PayloadAction<ChartOfAccount | null>) => {
      state.selectedAccount = action.payload
    },
  },
})

export const { setSelectedJournalEntry, setSelectedAccount } = accountingSlice.actions

export const selectSelectedJournalEntry = (state: RootState) => state.accounting.selectedJournalEntry
export const selectSelectedAccount = (state: RootState) => state.accounting.selectedAccount

export default accountingSlice.reducer
