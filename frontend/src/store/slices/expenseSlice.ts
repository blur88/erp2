import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { ExpenseRecord } from '@/types';
import { expenseApi } from '@/services/expenseApi';

interface ExpenseState {
  data: ExpenseRecord[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: ExpenseState = {
  data: [],
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

export const fetchExpenses = createAsyncThunk(
  'expenses/fetchAll',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      return await expenseApi.getAll(params);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch expenses');
    }
  },
);

export const createExpense = createAsyncThunk(
  'expenses/create',
  async (
    data: {
      expenseDate: string;
      expenseAccountId: string;
      amount: number;
      paymentMethodId: string;
      description?: string;
      vendor?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await expenseApi.create(data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create expense');
    }
  },
);

export const updateExpense = createAsyncThunk(
  'expenses/update',
  async (
    payload: {
      id: string;
      data: {
        expenseDate?: string;
        expenseAccountId?: string;
        amount?: number;
        paymentMethodId?: string;
        description?: string;
        vendor?: string;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      return await expenseApi.update(payload.id, payload.data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update expense');
    }
  },
);

export const deleteExpense = createAsyncThunk(
  'expenses/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await expenseApi.delete(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete expense');
    }
  },
);

export const postExpense = createAsyncThunk(
  'expenses/post',
  async (id: string, { rejectWithValue }) => {
    try {
      return await expenseApi.post(id);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to post expense');
    }
  },
);

export const bulkPostExpenses = createAsyncThunk(
  'expenses/bulkPost',
  async (ids: string[], { rejectWithValue }) => {
    try {
      return await expenseApi.bulkPost(ids);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk post expenses');
    }
  },
);

export const bulkDeleteExpenses = createAsyncThunk(
  'expenses/bulkDelete',
  async (ids: string[], { rejectWithValue }) => {
    try {
      return await expenseApi.bulkDelete(ids);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk delete expenses');
    }
  },
);

const expenseSlice = createSlice({
  name: 'expenses',
  initialState,
  reducers: {
    clearExpensesError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchExpenses.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchExpenses.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload?.data || [];
        state.pagination = action.payload?.meta || initialState.pagination;
      })
      .addCase(fetchExpenses.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createExpense.fulfilled, (state, action) => {
        if (action.payload) {
          state.data.unshift(action.payload);
        }
      })
      .addCase(createExpense.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateExpense.fulfilled, (state, action) => {
        if (action.payload) {
          const idx = state.data.findIndex((item) => item.id === action.payload.id);
          if (idx >= 0) {
            state.data[idx] = action.payload;
          }
        }
      })
      .addCase(updateExpense.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteExpense.fulfilled, (state, action) => {
        state.data = state.data.filter((item) => item.id !== action.payload);
      })
      .addCase(deleteExpense.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(postExpense.fulfilled, (state, action) => {
        if (action.payload) {
          const idx = state.data.findIndex((item) => item.id === action.payload.id);
          if (idx >= 0) {
            state.data[idx] = action.payload;
          }
        }
      })
      .addCase(postExpense.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(bulkPostExpenses.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(bulkDeleteExpenses.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { clearExpensesError } = expenseSlice.actions;

export const selectExpenses = (state: any) => state.expenses?.data || [];
export const selectExpensesLoading = (state: any) => state.expenses?.loading || false;
export const selectExpensesError = (state: any) => state.expenses?.error || null;
export const selectExpensesPagination = (state: any) => state.expenses?.pagination || initialState.pagination;

export default expenseSlice.reducer;
