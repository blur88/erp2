import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { ChartOfAccount } from '@/types'

interface AccountingState {
  selectedAccount: ChartOfAccount | null
}

const initialState: AccountingState = {
  selectedAccount: null,
}

const accountingSlice = createSlice({
  name: 'accounting',
  initialState,
  reducers: {
    setSelectedAccount: (state, action: PayloadAction<ChartOfAccount | null>) => {
      state.selectedAccount = action.payload
    },
  },
})

export const { setSelectedAccount } = accountingSlice.actions
export const selectSelectedAccount = (state: RootState) => state.accounting.selectedAccount
export default accountingSlice.reducer

