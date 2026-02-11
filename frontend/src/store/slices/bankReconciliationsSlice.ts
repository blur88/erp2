import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { BankReconciliation } from '@/types';
import { bankReconciliationsApi } from '@/services/accountingApi';

interface BankReconciliationsState {
  data: BankReconciliation[];
  selectedReconciliation: BankReconciliation | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: BankReconciliationsState = {
  data: [],
  selectedReconciliation: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

export const fetchBankReconciliations = createAsyncThunk(
  'bankReconciliations/fetchAll',
  async (params: {
    page?: number;
    limit?: number;
    accountId?: string;
    fiscalPeriodId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }, { rejectWithValue }) => {
    try {
      const response = await bankReconciliationsApi.getAll(params);
      return response || { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch reconciliations');
    }
  },
);

export const fetchBankReconciliationById = createAsyncThunk(
  'bankReconciliations/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.getById(id);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch reconciliation');
    }
  },
);

export const createBankReconciliation = createAsyncThunk(
  'bankReconciliations/create',
  async (data: {
    accountId: string;
    fiscalPeriodId: string;
    reconciliationDate: string;
    statementBalance: number;
  }, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.create(data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create reconciliation');
    }
  },
);

export const updateBankReconciliation = createAsyncThunk(
  'bankReconciliations/update',
  async ({ id, data }: { id: string; data: { reconciliationDate?: string; statementBalance?: number } }, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.update(id, data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update reconciliation');
    }
  },
);

export const deleteBankReconciliation = createAsyncThunk(
  'bankReconciliations/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await bankReconciliationsApi.delete(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete reconciliation');
    }
  },
);

export const markTransactionsCleared = createAsyncThunk(
  'bankReconciliations/markCleared',
  async ({ id, journalEntryLineIds }: { id: string; journalEntryLineIds: string[] }, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.markCleared(id, journalEntryLineIds);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to mark transactions cleared');
    }
  },
);

export const unmarkTransactionsCleared = createAsyncThunk(
  'bankReconciliations/unmarkCleared',
  async ({ id, journalEntryLineIds }: { id: string; journalEntryLineIds: string[] }, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.unmarkCleared(id, journalEntryLineIds);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to unmark transactions');
    }
  },
);

export const completeBankReconciliation = createAsyncThunk(
  'bankReconciliations/complete',
  async (id: string, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.complete(id);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to complete reconciliation');
    }
  },
);

export const reopenBankReconciliation = createAsyncThunk(
  'bankReconciliations/reopen',
  async (id: string, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.reopen(id);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to reopen reconciliation');
    }
  },
);

const bankReconciliationsSlice = createSlice({
  name: 'bankReconciliations',
  initialState,
  reducers: {
    setSelectedReconciliation: (state, action: PayloadAction<BankReconciliation | null>) => {
      state.selectedReconciliation = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBankReconciliations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBankReconciliations.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          const payload = action.payload as any;
          state.data = payload.data || [];
          state.pagination = payload.meta || { page: 1, limit: 20, total: 0, totalPages: 0 };
        }
      })
      .addCase(fetchBankReconciliations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(fetchBankReconciliationById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBankReconciliationById.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.selectedReconciliation = action.payload;
          const index = state.data.findIndex((r) => r.id === action.payload.id);
          if (index >= 0) state.data[index] = action.payload;
        }
      })
      .addCase(fetchBankReconciliationById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(createBankReconciliation.fulfilled, (state, action) => {
        if (action.payload) state.data.unshift(action.payload);
      })
      .addCase(createBankReconciliation.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    builder
      .addCase(updateBankReconciliation.fulfilled, (state, action) => {
        if (action.payload) {
          const index = state.data.findIndex((r) => r.id === action.payload.id);
          if (index >= 0) state.data[index] = action.payload;
          if (state.selectedReconciliation?.id === action.payload.id) {
            state.selectedReconciliation = action.payload;
          }
        }
      })
      .addCase(updateBankReconciliation.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    builder
      .addCase(deleteBankReconciliation.fulfilled, (state, action) => {
        if (action.payload) {
          state.data = state.data.filter((r) => r.id !== action.payload);
          if (state.selectedReconciliation?.id === action.payload) {
            state.selectedReconciliation = null;
          }
        }
      })
      .addCase(deleteBankReconciliation.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    const updateSelected = (state: BankReconciliationsState, action: any) => {
      state.loading = false;
      if (action.payload) {
        const index = state.data.findIndex((r) => r.id === action.payload.id);
        if (index >= 0) state.data[index] = action.payload;
        if (state.selectedReconciliation?.id === action.payload.id) {
          state.selectedReconciliation = action.payload;
        }
      }
    };

    builder
      .addCase(markTransactionsCleared.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(markTransactionsCleared.fulfilled, updateSelected)
      .addCase(markTransactionsCleared.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });

    builder
      .addCase(unmarkTransactionsCleared.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(unmarkTransactionsCleared.fulfilled, updateSelected)
      .addCase(unmarkTransactionsCleared.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });

    builder
      .addCase(completeBankReconciliation.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(completeBankReconciliation.fulfilled, updateSelected)
      .addCase(completeBankReconciliation.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });

    builder
      .addCase(reopenBankReconciliation.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(reopenBankReconciliation.fulfilled, updateSelected)
      .addCase(reopenBankReconciliation.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });
  },
});

export const { setSelectedReconciliation, clearError } = bankReconciliationsSlice.actions;

export const selectBankReconciliations = (state: any) => state.bankReconciliations?.data;
export const selectSelectedReconciliation = (state: any) => state.bankReconciliations?.selectedReconciliation;
export const selectBankReconciliationsLoading = (state: any) => state.bankReconciliations?.loading;
export const selectBankReconciliationsError = (state: any) => state.bankReconciliations?.error;
export const selectBankReconciliationsPagination = (state: any) => state.bankReconciliations?.pagination;

export default bankReconciliationsSlice.reducer;
