import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ApiService } from '@/services/api';

// TypeScript interfaces for all 5 report types

interface TrialBalanceAccount {
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
}

interface TrialBalanceReport {
  accounts: TrialBalanceAccount[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

interface AccountBalance {
  accountCode: string;
  accountName: string;
  balance: number;
}

interface BalanceSheetReport {
  assets: {
    current: AccountBalance[];
    fixed: AccountBalance[];
    totalCurrent: number;
    totalFixed: number;
    total: number;
  };
  liabilities: {
    current: AccountBalance[];
    longTerm: AccountBalance[];
    totalCurrent: number;
    totalLongTerm: number;
    total: number;
  };
  equity: {
    accounts: AccountBalance[];
    netIncome: number;
    total: number;
  };
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

type ProfitAndLossApiAccount = {
  id?: string;
  code?: string;
  name?: string;
  amount?: number;
  accountCode?: string;
  accountName?: string;
  balance?: number;
};

type ProfitAndLossApiSection = {
  accounts?: ProfitAndLossApiAccount[];
  subtotal?: number;
  total?: number;
};

type ProfitAndLossApiResponse = {
  startDate?: string;
  endDate?: string;
  revenue?: ProfitAndLossApiSection;
  cogs?: ProfitAndLossApiSection;
  costOfGoodsSold?: ProfitAndLossApiSection;
  expenses?: ProfitAndLossApiSection;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProfitAndLossSection = (
  section?: ProfitAndLossApiSection,
): { accounts: Array<{ id: string; code: string; name: string; amount: number }>; subtotal: number } => {
  const accounts = (section?.accounts ?? []).map((account, index) => {
    const code = account.code ?? account.accountCode ?? '';
    const name = account.name ?? account.accountName ?? '';
    const amount = toNumber(account.amount ?? account.balance);

    return {
      id: account.id ?? `${code || 'account'}-${index}`,
      code,
      name,
      amount,
    };
  });

  const computedSubtotal = accounts.reduce((sum, account) => sum + account.amount, 0);
  const subtotal = toNumber(section?.subtotal ?? section?.total, computedSubtotal);

  return { accounts, subtotal };
};

const normalizeProfitAndLossReport = (
  response: ProfitAndLossApiResponse,
  params: { startDate: string; endDate: string },
): ProfitAndLossReport => {
  const revenue = normalizeProfitAndLossSection(response.revenue);
  const cogs = normalizeProfitAndLossSection(response.cogs ?? response.costOfGoodsSold);
  const expenses = normalizeProfitAndLossSection(response.expenses);

  const grossProfit = toNumber(response.grossProfit, revenue.subtotal - cogs.subtotal);
  const operatingIncome = toNumber(response.operatingIncome, grossProfit - expenses.subtotal);
  const netIncome = toNumber(response.netIncome, operatingIncome);

  return {
    startDate: response.startDate ?? params.startDate,
    endDate: response.endDate ?? params.endDate,
    revenue,
    cogs,
    expenses,
    grossProfit,
    operatingIncome,
    netIncome,
  };
};

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

type GeneralLedgerApiTransaction = {
  date?: string;
  entryNumber?: string;
  description?: string;
  debitAmount?: number;
  creditAmount?: number;
  runningBalance?: number;
  debit?: number;
  credit?: number;
  balance?: number;
};

type GeneralLedgerApiResponse = {
  account?: {
    id?: string;
    code?: string;
    name?: string;
    type?: string;
  };
  startDate?: string;
  endDate?: string;
  openingBalance?: number;
  transactions?: GeneralLedgerApiTransaction[];
  totalDebits?: number;
  totalCredits?: number;
  closingBalance?: number;
};

const normalizeGeneralLedgerReport = (
  response: GeneralLedgerApiResponse,
  params: { accountId: string; startDate: string; endDate: string },
): GeneralLedgerReport => {
  const transactions = (response.transactions ?? []).map((transaction) => {
    const debitAmount = toNumber(transaction.debitAmount ?? transaction.debit);
    const creditAmount = toNumber(transaction.creditAmount ?? transaction.credit);

    return {
      date: transaction.date ?? '',
      entryNumber: transaction.entryNumber ?? '',
      description: transaction.description ?? '',
      debitAmount,
      creditAmount,
      runningBalance: toNumber(transaction.runningBalance ?? transaction.balance),
    };
  });

  const computedTotalDebits = transactions.reduce((sum, transaction) => sum + transaction.debitAmount, 0);
  const computedTotalCredits = transactions.reduce((sum, transaction) => sum + transaction.creditAmount, 0);
  const openingBalance = toNumber(response.openingBalance);
  const closingBalance = toNumber(
    response.closingBalance,
    transactions.length > 0
      ? transactions[transactions.length - 1].runningBalance
      : openingBalance,
  );

  return {
    account: {
      id: response.account?.id ?? params.accountId,
      code: response.account?.code ?? '',
      name: response.account?.name ?? '',
      type: response.account?.type ?? '',
    },
    startDate: response.startDate ?? params.startDate,
    endDate: response.endDate ?? params.endDate,
    openingBalance,
    transactions,
    totalDebits: toNumber(response.totalDebits, computedTotalDebits),
    totalCredits: toNumber(response.totalCredits, computedTotalCredits),
    closingBalance,
  };
};

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

type AccountActivityApiEntry = {
  id?: string;
  entryDate?: string;
  date?: string;
  entryNumber?: string;
  referenceNumber?: string;
  entryType?: string;
  status?: string;
  description?: string;
  debitAmount?: number;
  creditAmount?: number;
  debit?: number;
  credit?: number;
  referenceType?: string;
  referenceId?: string;
};

type AccountActivityApiResponse = {
  account?: {
    id?: string;
    code?: string;
    name?: string;
    type?: string;
  };
  startDate?: string;
  endDate?: string;
  entries?: AccountActivityApiEntry[];
  activity?: AccountActivityApiEntry[];
  totalEntries?: number;
};

const normalizeAccountActivityReport = (
  response: AccountActivityApiResponse,
  params: { accountId: string; startDate: string; endDate: string },
): AccountActivityReport => {
  const rawEntries = response.entries ?? response.activity ?? [];
  const entries = rawEntries.map((entry, index) => {
    const entryNumber = entry.entryNumber ?? entry.referenceNumber ?? '';

    return {
      id: entry.id ?? `${entryNumber || 'entry'}-${index}`,
      entryDate: entry.entryDate ?? entry.date ?? '',
      entryNumber,
      entryType: entry.entryType ?? entry.referenceType ?? 'MANUAL',
      status: entry.status ?? '',
      description: entry.description ?? '',
      debitAmount: toNumber(entry.debitAmount ?? entry.debit),
      creditAmount: toNumber(entry.creditAmount ?? entry.credit),
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      referenceNumber: entry.referenceNumber,
    };
  });

  return {
    account: {
      id: response.account?.id ?? params.accountId,
      code: response.account?.code ?? '',
      name: response.account?.name ?? '',
      type: response.account?.type ?? '',
    },
    startDate: response.startDate ?? params.startDate,
    endDate: response.endDate ?? params.endDate,
    entries,
    totalEntries: toNumber(response.totalEntries, entries.length),
  };
};

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
      const response = await ApiService.get<ProfitAndLossApiResponse>(
        `${BASE_URL}/profit-loss`,
        { params }
      );
      return normalizeProfitAndLossReport(response, params);
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
      const response = await ApiService.get<GeneralLedgerApiResponse>(
        `${BASE_URL}/general-ledger`,
        { params }
      );
      return normalizeGeneralLedgerReport(response, params);
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
      const response = await ApiService.get<AccountActivityApiResponse>(
        `${BASE_URL}/account-activity`,
        { params }
      );
      return normalizeAccountActivityReport(response, params);
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
      const response = await ApiService.get(`${BASE_URL}/trial-balance/export`, {
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
      const response = await ApiService.get(`${BASE_URL}/balance-sheet/export`, {
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
      const response = await ApiService.get(`${BASE_URL}/general-ledger/export`, {
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
      const response = await ApiService.get(`${BASE_URL}/account-activity/export`, {
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
