import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PaymentMethodConfig } from '@/types';
import { paymentMethodsApi } from '@/services/paymentMethodsApi';

interface PaymentMethodsState {
  data: PaymentMethodConfig[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: PaymentMethodsState = {
  data: [],
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  },
};

export const fetchPaymentMethods = createAsyncThunk(
  'paymentMethods/fetchAll',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      return await paymentMethodsApi.getAll(params);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch payment methods');
    }
  },
);

export const createPaymentMethod = createAsyncThunk(
  'paymentMethods/create',
  async (data: Partial<PaymentMethodConfig>, { rejectWithValue }) => {
    try {
      return await paymentMethodsApi.create(data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create payment method');
    }
  },
);

export const updatePaymentMethod = createAsyncThunk(
  'paymentMethods/update',
  async ({ id, data }: { id: string; data: Partial<PaymentMethodConfig> }, { rejectWithValue }) => {
    try {
      return await paymentMethodsApi.update(id, data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update payment method');
    }
  },
);

export const deletePaymentMethod = createAsyncThunk(
  'paymentMethods/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await paymentMethodsApi.delete(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete payment method');
    }
  },
);

const paymentMethodsSlice = createSlice({
  name: 'paymentMethods',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPaymentMethods.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPaymentMethods.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload?.data || [];
        state.pagination = action.payload?.meta || initialState.pagination;
      })
      .addCase(fetchPaymentMethods.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createPaymentMethod.fulfilled, (state, action) => {
        if (action.payload) {
          state.data.unshift(action.payload);
        }
      })
      .addCase(createPaymentMethod.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updatePaymentMethod.fulfilled, (state, action) => {
        if (action.payload) {
          const i = state.data.findIndex((m) => m.id === action.payload.id);
          if (i >= 0) {
            state.data[i] = action.payload;
          }
        }
      })
      .addCase(updatePaymentMethod.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deletePaymentMethod.fulfilled, (state, action) => {
        state.data = state.data.filter((m) => m.id !== action.payload);
      })
      .addCase(deletePaymentMethod.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const selectPaymentMethods = (state: any) => state.paymentMethods?.data || [];
export const selectPaymentMethodsLoading = (state: any) => state.paymentMethods?.loading || false;

export default paymentMethodsSlice.reducer;
