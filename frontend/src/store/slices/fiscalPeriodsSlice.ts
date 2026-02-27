import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { FiscalPeriod, FiscalPeriodStatus, PaginatedResponse } from '@/types';
import { fiscalPeriodsApi } from '@/services/accountingApi';

interface FiscalPeriodsState {
  data: FiscalPeriod[];
  currentPeriod: FiscalPeriod | null;
  selectedPeriod: FiscalPeriod | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: FiscalPeriodsState = {
  data: [],
  currentPeriod: null,
  selectedPeriod: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

// Async thunks
export const fetchFiscalPeriods = createAsyncThunk(
  'fiscalPeriods/fetchAll',
  async (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: FiscalPeriodStatus;
    year?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }, { rejectWithValue }) => {
    try {
      const response = await fiscalPeriodsApi.getAll(params);
      return response || { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch fiscal periods');
    }
  }
);

export const fetchFiscalPeriodById = createAsyncThunk(
  'fiscalPeriods/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await fiscalPeriodsApi.getById(id);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch fiscal period');
    }
  }
);

export const fetchCurrentPeriod = createAsyncThunk(
  'fiscalPeriods/fetchCurrent',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fiscalPeriodsApi.getCurrent();
      return response;
    } catch (error: any) {
      console.error('Failed to fetch current period:', error);
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch current period');
    }
  }
);

export const createFiscalPeriod = createAsyncThunk(
  'fiscalPeriods/create',
  async (periodData: Partial<FiscalPeriod>, { rejectWithValue }) => {
    try {
      const response = await fiscalPeriodsApi.create(periodData);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create fiscal period');
    }
  }
);

export const updateFiscalPeriod = createAsyncThunk(
  'fiscalPeriods/update',
  async ({ id, data }: { id: string; data: Partial<FiscalPeriod> }, { rejectWithValue }) => {
    try {
      const response = await fiscalPeriodsApi.update(id, data);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update fiscal period');
    }
  }
);

export const deleteFiscalPeriod = createAsyncThunk(
  'fiscalPeriods/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await fiscalPeriodsApi.delete(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete fiscal period');
    }
  }
);

export const closePeriod = createAsyncThunk(
  'fiscalPeriods/close',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await fiscalPeriodsApi.close(id);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to close fiscal period');
    }
  }
);

export const reopenPeriod = createAsyncThunk(
  'fiscalPeriods/reopen',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await fiscalPeriodsApi.reopen(id);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to reopen fiscal period');
    }
  }
);

export const generatePeriods = createAsyncThunk(
  'fiscalPeriods/generate',
  async ({ year, startMonth }: { year: number; startMonth?: number }, { rejectWithValue }) => {
    try {
      const response = await fiscalPeriodsApi.generate(year, startMonth);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to generate fiscal periods');
    }
  }
);

const fiscalPeriodsSlice = createSlice({
  name: 'fiscalPeriods',
  initialState,
  reducers: {
    setSelectedPeriod: (state, action: PayloadAction<FiscalPeriod | null>) => {
      state.selectedPeriod = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch all periods
    builder
      .addCase(fetchFiscalPeriods.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFiscalPeriods.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          const payload = action.payload as any;
          state.data = payload.data || [];
          state.pagination = payload.meta || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0,
          };
        }
      })
      .addCase(fetchFiscalPeriods.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch period by ID
    builder
      .addCase(fetchFiscalPeriodById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFiscalPeriodById.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.selectedPeriod = action.payload;
          // Update in list if exists
          const index = state.data.findIndex((p) => p.id === action.payload.id);
          if (index >= 0) {
            state.data[index] = action.payload;
          }
        }
      })
      .addCase(fetchFiscalPeriodById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch current period
    builder
      .addCase(fetchCurrentPeriod.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCurrentPeriod.fulfilled, (state, action) => {
        state.loading = false;
        state.currentPeriod = action.payload ?? null;
      })
      .addCase(fetchCurrentPeriod.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create period
    builder
      .addCase(createFiscalPeriod.fulfilled, (state, action) => {
        if (action.payload) {
          state.data.unshift(action.payload);
        }
      })
      .addCase(createFiscalPeriod.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Update period
    builder
      .addCase(updateFiscalPeriod.fulfilled, (state, action) => {
        if (action.payload) {
          const index = state.data.findIndex((p) => p.id === action.payload.id);
          if (index >= 0) {
            state.data[index] = action.payload;
          }
          if (state.selectedPeriod?.id === action.payload.id) {
            state.selectedPeriod = action.payload;
          }
          if (state.currentPeriod?.id === action.payload.id) {
            state.currentPeriod = action.payload;
          }
        }
      })
      .addCase(updateFiscalPeriod.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Delete period
    builder
      .addCase(deleteFiscalPeriod.fulfilled, (state, action) => {
        if (action.payload) {
          state.data = state.data.filter((p) => p.id !== action.payload);
          if (state.selectedPeriod?.id === action.payload) {
            state.selectedPeriod = null;
          }
          if (state.currentPeriod?.id === action.payload) {
            state.currentPeriod = null;
          }
        }
      })
      .addCase(deleteFiscalPeriod.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Close period
    builder
      .addCase(closePeriod.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(closePeriod.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          const index = state.data.findIndex((p) => p.id === action.payload.id);
          if (index >= 0) {
            state.data[index] = action.payload;
          }
          if (state.selectedPeriod?.id === action.payload.id) {
            state.selectedPeriod = action.payload;
          }
          if (state.currentPeriod?.id === action.payload.id) {
            state.currentPeriod = action.payload;
          }
        }
      })
      .addCase(closePeriod.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Reopen period
    builder
      .addCase(reopenPeriod.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(reopenPeriod.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          const index = state.data.findIndex((p) => p.id === action.payload.id);
          if (index >= 0) {
            state.data[index] = action.payload;
          }
          if (state.selectedPeriod?.id === action.payload.id) {
            state.selectedPeriod = action.payload;
          }
          if (state.currentPeriod?.id === action.payload.id) {
            state.currentPeriod = action.payload;
          }
        }
      })
      .addCase(reopenPeriod.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Generate periods
    builder
      .addCase(generatePeriods.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(generatePeriods.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          const payload = action.payload as any;
          // Prepend new periods to the list
          if (payload.data && Array.isArray(payload.data)) {
            state.data = [...payload.data, ...state.data];
          }
        }
      })
      .addCase(generatePeriods.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setSelectedPeriod, clearError } = fiscalPeriodsSlice.actions;

// Selectors
export const selectFiscalPeriods = (state: any) => state.fiscalPeriods?.data;
export const selectCurrentPeriod = (state: any) => state.fiscalPeriods?.currentPeriod;
export const selectSelectedPeriod = (state: any) => state.fiscalPeriods?.selectedPeriod;
export const selectFiscalPeriodsLoading = (state: any) => state.fiscalPeriods?.loading;
export const selectFiscalPeriodsError = (state: any) => state.fiscalPeriods?.error;
export const selectFiscalPeriodsPagination = (state: any) => state.fiscalPeriods?.pagination;

export default fiscalPeriodsSlice.reducer;
