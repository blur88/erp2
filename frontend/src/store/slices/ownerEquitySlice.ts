import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { OwnerEquityTransaction } from '@/types';
import { ownerEquityApi } from '@/services/ownerEquityApi';

interface OwnerEquityState {
  data: OwnerEquityTransaction[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: OwnerEquityState = {
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

export const fetchOwnerEquity = createAsyncThunk(
  'ownerEquity/fetchAll',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      return await ownerEquityApi.getAll(params);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch owner equity transactions',
      );
    }
  },
);

export const createOwnerEquity = createAsyncThunk(
  'ownerEquity/create',
  async (
    data: {
      transactionDate: string;
      type: string;
      amount: number;
      paymentMethodId: string;
      description?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await ownerEquityApi.create(data);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to create owner equity transaction',
      );
    }
  },
);

export const updateOwnerEquity = createAsyncThunk(
  'ownerEquity/update',
  async (
    payload: {
      id: string;
      data: {
        transactionDate?: string;
        type?: string;
        amount?: number;
        paymentMethodId?: string;
        description?: string;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      return await ownerEquityApi.update(payload.id, payload.data);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update owner equity transaction',
      );
    }
  },
);

export const deleteOwnerEquity = createAsyncThunk(
  'ownerEquity/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await ownerEquityApi.delete(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete owner equity transaction',
      );
    }
  },
);

export const postOwnerEquity = createAsyncThunk(
  'ownerEquity/post',
  async (id: string, { rejectWithValue }) => {
    try {
      return await ownerEquityApi.post(id);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to post owner equity transaction',
      );
    }
  },
);

export const bulkPostOwnerEquity = createAsyncThunk(
  'ownerEquity/bulkPost',
  async (ids: string[], { rejectWithValue }) => {
    try {
      return await ownerEquityApi.bulkPost(ids);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to bulk post owner equity transactions',
      );
    }
  },
);

export const bulkDeleteOwnerEquity = createAsyncThunk(
  'ownerEquity/bulkDelete',
  async (ids: string[], { rejectWithValue }) => {
    try {
      return await ownerEquityApi.bulkDelete(ids);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to bulk delete owner equity transactions',
      );
    }
  },
);

const ownerEquitySlice = createSlice({
  name: 'ownerEquity',
  initialState,
  reducers: {
    clearOwnerEquityError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOwnerEquity.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOwnerEquity.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload?.data || [];
        state.pagination = action.payload?.meta || initialState.pagination;
      })
      .addCase(fetchOwnerEquity.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createOwnerEquity.fulfilled, (state, action) => {
        if (action.payload) {
          state.data.unshift(action.payload);
        }
      })
      .addCase(createOwnerEquity.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateOwnerEquity.fulfilled, (state, action) => {
        if (action.payload) {
          const idx = state.data.findIndex((item) => item.id === action.payload.id);
          if (idx >= 0) {
            state.data[idx] = action.payload;
          }
        }
      })
      .addCase(updateOwnerEquity.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteOwnerEquity.fulfilled, (state, action) => {
        state.data = state.data.filter((item) => item.id !== action.payload);
      })
      .addCase(deleteOwnerEquity.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(postOwnerEquity.fulfilled, (state, action) => {
        if (action.payload) {
          const idx = state.data.findIndex((item) => item.id === action.payload.id);
          if (idx >= 0) {
            state.data[idx] = action.payload;
          }
        }
      })
      .addCase(postOwnerEquity.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(bulkPostOwnerEquity.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(bulkDeleteOwnerEquity.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { clearOwnerEquityError } = ownerEquitySlice.actions;

export const selectOwnerEquity = (state: any) => state.ownerEquity?.data || [];
export const selectOwnerEquityLoading = (state: any) => state.ownerEquity?.loading || false;
export const selectOwnerEquityError = (state: any) => state.ownerEquity?.error || null;
export const selectOwnerEquityPagination =
  (state: any) => state.ownerEquity?.pagination || initialState.pagination;

export default ownerEquitySlice.reducer;
