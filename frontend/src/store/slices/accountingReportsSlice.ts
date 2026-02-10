import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ApiService } from '@/services/api';

// TypeScript interfaces for all 5 report types

interface TrialBalanceAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  debitBalance: number;
  creditBalance: number;
}

interface TrialBalanceReport {
  asOfDate: string;
  accounts: TrialBalanceAccount[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

interface BalanceSheetSection {
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    balance: number;
  }>;
  subtotal: number;
}

interface BalanceSheetReport {
  asOfDate: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

interface ProfitAndLossReport {
  startDate: string;
  endDate: string;
  revenue: {
    accounts: Array<{ id: string; code: string; name: string; amount: number }>;
    subtotal: number;
  };
  cogs: {
    accounts: Array<{ id: string; code: string; name: string; amount: number }>;
    subtotal: number;
  };
  expenses: {
    accounts: Array<{ id: string; code: string; name: string; amount: number }>;
    subtotal: number;
  };
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
}

interface GeneralLedgerTransaction {
  date: string;
  entryNumber: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
}

interface GeneralLedgerReport {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
  startDate: string;
  endDate: string;
  openingBalance: number;
  transactions: GeneralLedgerTransaction[];
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
}

interface AccountActivityEntry {
  id: string;
  entryDate: string;
  entryNumber: string;
  entryType: string;
  status: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
}

interface AccountActivityReport {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
  startDate: string;
  endDate: string;
  entries: AccountActivityEntry[];
  totalEntries: number;
}

// State interface
interface AccountingReportsState {
  trialBalance: {
    data: TrialBalanceReport | null;
    loading: boolean;
    error: string | null;
  };
  balanceSheet: {
    data: BalanceSheetReport | null;
    loading: boolean;
    error: string | null;
  };
  profitAndLoss: {
    data: ProfitAndLossReport | null;
    loading: boolean;
    error: string | null;
  };
  generalLedger: {
    data: GeneralLedgerReport | null;
    loading: boolean;
    error: string | null;
  };
  accountActivity: {
    data: AccountActivityReport | null;
    loading: boolean;
    error: string | null;
  };
  downloading: boolean;
}

const initialState: AccountingReportsState = {
  trialBalance: {
    data: null,
    loading: false,
    error: null,
  },
  balanceSheet: {
    data: null,
    loading: false,
    error: null,
  },
  profitAndLoss: {
    data: null,
    loading: false,
    error: null,
  },
  generalLedger: {
    data: null,
    loading: false,
    error: null,
  },
  accountActivity: {
    data: null,
    loading: false,
    error: null,
  },
  downloading: false,
};

const BASE_URL = '/accounting/reports';

// Async thunks for fetching reports

export const fetchTrialBalance = createAsyncThunk(
  'accountingReports/fetchTrialBalance',
  async (
    params: {
      asOfDate: string;
      includeInactive?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get<TrialBalanceReport>(
        `${BASE_URL}/trial-balance`,
        { params }
      );
      return response;
    } catch (error: any) {
      console.error('Failed to fetch trial balance:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch trial balance'
      );
    }
  }
);

export const fetchBalanceSheet = createAsyncThunk(
  'accountingReports/fetchBalanceSheet',
  async (
    params: {
      asOfDate: string;
      includeInactive?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get<BalanceSheetReport>(
        `${BASE_URL}/balance-sheet`,
        { params }
      );
      return response;
    } catch (error: any) {
      console.error('Failed to fetch balance sheet:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch balance sheet'
      );
    }
  }
);

export const fetchProfitAndLoss = createAsyncThunk(
  'accountingReports/fetchProfitAndLoss',
  async (
    params: {
      startDate: string;
      endDate: string;
      includeInactive?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get<ProfitAndLossReport>(
        `${BASE_URL}/profit-loss`,
        { params }
      );
      return response;
    } catch (error: any) {
      console.error('Failed to fetch profit and loss:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch profit and loss'
      );
    }
  }
);

export const fetchGeneralLedger = createAsyncThunk(
  'accountingReports/fetchGeneralLedger',
  async (
    params: {
      accountId: string;
      startDate: string;
      endDate: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get<GeneralLedgerReport>(
        `${BASE_URL}/general-ledger`,
        { params }
      );
      return response;
    } catch (error: any) {
      console.error('Failed to fetch general ledger:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch general ledger'
      );
    }
  }
);

export const fetchAccountActivity = createAsyncThunk(
  'accountingReports/fetchAccountActivity',
  async (
    params: {
      accountId: string;
      startDate: string;
      endDate: string;
      status?: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get<AccountActivityReport>(
        `${BASE_URL}/account-activity`,
        { params }
      );
      return response;
    } catch (error: any) {
      console.error('Failed to fetch account activity:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch account activity'
      );
    }
  }
);

// Async thunks for Excel downloads

export const downloadTrialBalanceExcel = createAsyncThunk(
  'accountingReports/downloadTrialBalanceExcel',
  async (
    params: {
      asOfDate: string;
      includeInactive?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get(`${BASE_URL}/trial-balance/excel`, {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `trial-balance-${params.asOfDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to download trial balance Excel:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to download trial balance Excel'
      );
    }
  }
);

export const downloadBalanceSheetExcel = createAsyncThunk(
  'accountingReports/downloadBalanceSheetExcel',
  async (
    params: {
      asOfDate: string;
      includeInactive?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get(`${BASE_URL}/balance-sheet/excel`, {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `balance-sheet-${params.asOfDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to download balance sheet Excel:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to download balance sheet Excel'
      );
    }
  }
);

export const downloadProfitAndLossExcel = createAsyncThunk(
  'accountingReports/downloadProfitAndLossExcel',
  async (
    params: {
      startDate: string;
      endDate: string;
      includeInactive?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get(`${BASE_URL}/profit-loss/export`, {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `profit-and-loss-${params.startDate}-to-${params.endDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to download profit and loss Excel:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to download profit and loss Excel'
      );
    }
  }
);

export const downloadGeneralLedgerExcel = createAsyncThunk(
  'accountingReports/downloadGeneralLedgerExcel',
  async (
    params: {
      accountId: string;
      startDate: string;
      endDate: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get(`${BASE_URL}/general-ledger/excel`, {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `general-ledger-${params.accountId}-${params.startDate}-to-${params.endDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to download general ledger Excel:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to download general ledger Excel'
      );
    }
  }
);

export const downloadAccountActivityExcel = createAsyncThunk(
  'accountingReports/downloadAccountActivityExcel',
  async (
    params: {
      accountId: string;
      startDate: string;
      endDate: string;
      status?: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await ApiService.get(`${BASE_URL}/account-activity/excel`, {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `account-activity-${params.accountId}-${params.startDate}-to-${params.endDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to download account activity Excel:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to download account activity Excel'
      );
    }
  }
);

// Slice
const accountingReportsSlice = createSlice({
  name: 'accountingReports',
  initialState,
  reducers: {
    clearTrialBalanceError: (state) => {
      state.trialBalance.error = null;
    },
    clearBalanceSheetError: (state) => {
      state.balanceSheet.error = null;
    },
    clearProfitAndLossError: (state) => {
      state.profitAndLoss.error = null;
    },
    clearGeneralLedgerError: (state) => {
      state.generalLedger.error = null;
    },
    clearAccountActivityError: (state) => {
      state.accountActivity.error = null;
    },
    clearAllReports: (state) => {
      state.trialBalance.data = null;
      state.balanceSheet.data = null;
      state.profitAndLoss.data = null;
      state.generalLedger.data = null;
      state.accountActivity.data = null;
    },
  },
  extraReducers: (builder) => {
    // Trial Balance
    builder
      .addCase(fetchTrialBalance.pending, (state) => {
        state.trialBalance.loading = true;
        state.trialBalance.error = null;
      })
      .addCase(fetchTrialBalance.fulfilled, (state, action) => {
        state.trialBalance.loading = false;
        if (action.payload) {
          state.trialBalance.data = action.payload;
        }
      })
      .addCase(fetchTrialBalance.rejected, (state, action) => {
        state.trialBalance.loading = false;
        state.trialBalance.error = action.payload as string;
      });

    // Balance Sheet
    builder
      .addCase(fetchBalanceSheet.pending, (state) => {
        state.balanceSheet.loading = true;
        state.balanceSheet.error = null;
      })
      .addCase(fetchBalanceSheet.fulfilled, (state, action) => {
        state.balanceSheet.loading = false;
        if (action.payload) {
          state.balanceSheet.data = action.payload;
        }
      })
      .addCase(fetchBalanceSheet.rejected, (state, action) => {
        state.balanceSheet.loading = false;
        state.balanceSheet.error = action.payload as string;
      });

    // Profit and Loss
    builder
      .addCase(fetchProfitAndLoss.pending, (state) => {
        state.profitAndLoss.loading = true;
        state.profitAndLoss.error = null;
      })
      .addCase(fetchProfitAndLoss.fulfilled, (state, action) => {
        state.profitAndLoss.loading = false;
        if (action.payload) {
          state.profitAndLoss.data = action.payload;
        }
      })
      .addCase(fetchProfitAndLoss.rejected, (state, action) => {
        state.profitAndLoss.loading = false;
        state.profitAndLoss.error = action.payload as string;
      });

    // General Ledger
    builder
      .addCase(fetchGeneralLedger.pending, (state) => {
        state.generalLedger.loading = true;
        state.generalLedger.error = null;
      })
      .addCase(fetchGeneralLedger.fulfilled, (state, action) => {
        state.generalLedger.loading = false;
        if (action.payload) {
          state.generalLedger.data = action.payload;
        }
      })
      .addCase(fetchGeneralLedger.rejected, (state, action) => {
        state.generalLedger.loading = false;
        state.generalLedger.error = action.payload as string;
      });

    // Account Activity
    builder
      .addCase(fetchAccountActivity.pending, (state) => {
        state.accountActivity.loading = true;
        state.accountActivity.error = null;
      })
      .addCase(fetchAccountActivity.fulfilled, (state, action) => {
        state.accountActivity.loading = false;
        if (action.payload) {
          state.accountActivity.data = action.payload;
        }
      })
      .addCase(fetchAccountActivity.rejected, (state, action) => {
        state.accountActivity.loading = false;
        state.accountActivity.error = action.payload as string;
      });

    // Excel Downloads - set downloading state
    builder
      .addCase(downloadTrialBalanceExcel.pending, (state) => {
        state.downloading = true;
      })
      .addCase(downloadTrialBalanceExcel.fulfilled, (state) => {
        state.downloading = false;
      })
      .addCase(downloadTrialBalanceExcel.rejected, (state) => {
        state.downloading = false;
      });

    builder
      .addCase(downloadBalanceSheetExcel.pending, (state) => {
        state.downloading = true;
      })
      .addCase(downloadBalanceSheetExcel.fulfilled, (state) => {
        state.downloading = false;
      })
      .addCase(downloadBalanceSheetExcel.rejected, (state) => {
        state.downloading = false;
      });

    builder
      .addCase(downloadProfitAndLossExcel.pending, (state) => {
        state.downloading = true;
      })
      .addCase(downloadProfitAndLossExcel.fulfilled, (state) => {
        state.downloading = false;
      })
      .addCase(downloadProfitAndLossExcel.rejected, (state) => {
        state.downloading = false;
      });

    builder
      .addCase(downloadGeneralLedgerExcel.pending, (state) => {
        state.downloading = true;
      })
      .addCase(downloadGeneralLedgerExcel.fulfilled, (state) => {
        state.downloading = false;
      })
      .addCase(downloadGeneralLedgerExcel.rejected, (state) => {
        state.downloading = false;
      });

    builder
      .addCase(downloadAccountActivityExcel.pending, (state) => {
        state.downloading = true;
      })
      .addCase(downloadAccountActivityExcel.fulfilled, (state) => {
        state.downloading = false;
      })
      .addCase(downloadAccountActivityExcel.rejected, (state) => {
        state.downloading = false;
      });
  },
});

export const {
  clearTrialBalanceError,
  clearBalanceSheetError,
  clearProfitAndLossError,
  clearGeneralLedgerError,
  clearAccountActivityError,
  clearAllReports,
} = accountingReportsSlice.actions;

// Selectors
export const selectTrialBalance = (state: any) => state.accountingReports?.trialBalance;
export const selectBalanceSheet = (state: any) => state.accountingReports?.balanceSheet;
export const selectProfitAndLoss = (state: any) => state.accountingReports?.profitAndLoss;
export const selectGeneralLedger = (state: any) => state.accountingReports?.generalLedger;
export const selectAccountActivity = (state: any) => state.accountingReports?.accountActivity;
export const selectDownloading = (state: any) => state.accountingReports?.downloading;

export default accountingReportsSlice.reducer;
