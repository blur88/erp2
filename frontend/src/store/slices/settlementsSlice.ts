import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PendingSettlementSummary, Settlement } from '@/types';
import { settlementsApi } from '@/services/settlementsApi';

interface SettlementsState {
  data: Settlement[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  pendingSummary: PendingSettlementSummary[];
  pendingPayments: any[];
}

const initialState: SettlementsState = {
  data: [],
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  pendingSummary: [],
  pendingPayments: [],
};

export const fetchSettlements = createAsyncThunk(
  'settlements/fetchAll',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      return await settlementsApi.getAll(params);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch settlements');
    }
  },
);

export const createSettlement = createAsyncThunk(
  'settlements/create',
  async (data: {
    paymentMethodId: string;
    settlementDate: string;
    paymentIds: string[];
    reference?: string;
    notes?: string;
  }, { rejectWithValue }) => {
    try {
      return await settlementsApi.create(data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create settlement');
    }
  },
);

export const cancelSettlement = createAsyncThunk(
  'settlements/cancel',
  async (id: string, { rejectWithValue }) => {
    try {
      return await settlementsApi.cancel(id);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to cancel settlement');
    }
  },
);

export const fetchPendingSummary = createAsyncThunk(
  'settlements/fetchPendingSummary',
  async (_, { rejectWithValue }) => {
    try {
      return await settlementsApi.getPendingSummary();
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch pending summary');
    }
  },
);

export const fetchPendingPayments = createAsyncThunk(
  'settlements/fetchPendingPayments',
  async (paymentMethodId: string, { rejectWithValue }) => {
    try {
      return await settlementsApi.getPendingPayments(paymentMethodId);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch pending payments');
    }
  },
);

const settlementsSlice = createSlice({
  name: 'settlements',
  initialState,
  reducers: {
    clearSettlementsError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettlements.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettlements.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload?.data || [];
        state.pagination = action.payload?.meta || initialState.pagination;
      })
      .addCase(fetchSettlements.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createSettlement.fulfilled, (state, action) => {
        if (action.payload) {
          state.data.unshift(action.payload);
        }
      })
      .addCase(createSettlement.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(cancelSettlement.fulfilled, (state, action) => {
        if (action.payload) {
          const i = state.data.findIndex((s) => s.id === action.payload.id);
          if (i >= 0) {
            state.data[i] = action.payload;
          }
        }
      })
      .addCase(cancelSettlement.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(fetchPendingSummary.fulfilled, (state, action) => {
        state.pendingSummary = action.payload || [];
      })
      .addCase(fetchPendingPayments.fulfilled, (state, action) => {
        state.pendingPayments = action.payload || [];
      });
  },
});

export const { clearSettlementsError } = settlementsSlice.actions;

export const selectSettlements = (state: any) => state.settlements?.data || [];
export const selectSettlementsLoading = (state: any) => state.settlements?.loading || false;
export const selectSettlementsError = (state: any) => state.settlements?.error || null;
export const selectSettlementsPagination = (state: any) => state.settlements?.pagination || initialState.pagination;
export const selectPendingSummary = (state: any) => state.settlements?.pendingSummary || [];
export const selectPendingPayments = (state: any) => state.settlements?.pendingPayments || [];

export default settlementsSlice.reducer;
