import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type {
  BankReconciliation,
  ChartOfAccount,
  ExpenseRecord,
  FiscalPeriod,
  FundTransfer,
  JournalEntry,
  OwnerEquityTransaction,
  Settlement,
} from '@/types'

interface AccountingState {
  selectedAccount: ChartOfAccount | null
  selectedJournalEntry: JournalEntry | null
  selectedExpense: ExpenseRecord | null
  selectedFiscalPeriod: FiscalPeriod | null
  selectedFundTransfer: FundTransfer | null
  selectedOwnerEquityTransaction: OwnerEquityTransaction | null
  selectedBankReconciliation: BankReconciliation | null
  selectedSettlement: Settlement | null
}

const initialState: AccountingState = {
  selectedAccount: null,
  selectedJournalEntry: null,
  selectedExpense: null,
  selectedFiscalPeriod: null,
  selectedFundTransfer: null,
  selectedOwnerEquityTransaction: null,
  selectedBankReconciliation: null,
  selectedSettlement: null,
}

const accountingSlice = createSlice({
  name: 'accounting',
  initialState,
  reducers: {
    setSelectedAccount: (state, action: PayloadAction<ChartOfAccount | null>) => {
      state.selectedAccount = action.payload
    },
    setSelectedJournalEntry: (state, action: PayloadAction<JournalEntry | null>) => {
      state.selectedJournalEntry = action.payload
    },
    setSelectedExpense: (state, action: PayloadAction<ExpenseRecord | null>) => {
      state.selectedExpense = action.payload
    },
    setSelectedFiscalPeriod: (state, action: PayloadAction<FiscalPeriod | null>) => {
      state.selectedFiscalPeriod = action.payload
    },
    setSelectedFundTransfer: (state, action: PayloadAction<FundTransfer | null>) => {
      state.selectedFundTransfer = action.payload
    },
    setSelectedOwnerEquityTransaction: (state, action: PayloadAction<OwnerEquityTransaction | null>) => {
      state.selectedOwnerEquityTransaction = action.payload
    },
    setSelectedBankReconciliation: (state, action: PayloadAction<BankReconciliation | null>) => {
      state.selectedBankReconciliation = action.payload
    },
    setSelectedSettlement: (state, action: PayloadAction<Settlement | null>) => {
      state.selectedSettlement = action.payload
    },
  },
})

export const {
  setSelectedAccount,
  setSelectedJournalEntry,
  setSelectedExpense,
  setSelectedFiscalPeriod,
  setSelectedFundTransfer,
  setSelectedOwnerEquityTransaction,
  setSelectedBankReconciliation,
  setSelectedSettlement,
} = accountingSlice.actions

export const selectSelectedAccount = (state: RootState) => state.accounting.selectedAccount
export const selectSelectedJournalEntry = (state: RootState) => state.accounting.selectedJournalEntry
export const selectSelectedExpense = (state: RootState) => state.accounting.selectedExpense
export const selectSelectedFiscalPeriod = (state: RootState) => state.accounting.selectedFiscalPeriod
export const selectSelectedFundTransfer = (state: RootState) => state.accounting.selectedFundTransfer
export const selectSelectedOwnerEquityTransaction = (state: RootState) => state.accounting.selectedOwnerEquityTransaction
export const selectSelectedBankReconciliation = (state: RootState) => state.accounting.selectedBankReconciliation
export const selectSelectedSettlement = (state: RootState) => state.accounting.selectedSettlement

export default accountingSlice.reducer
