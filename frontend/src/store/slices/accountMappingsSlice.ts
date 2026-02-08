import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  AccountMapping,
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
  AccountMappingValidationResult,
} from '@/types/accountMapping';
import { accountMappingsApi } from '@/services/accountingApi';

interface AccountMappingsState {
  mappings: AccountMapping[];
  loading: boolean;
  error: string | null;
  isValid: boolean;
  validationResult: AccountMappingValidationResult | null;
}

const initialState: AccountMappingsState = {
  mappings: [],
  loading: false,
  error: null,
  isValid: false,
  validationResult: null,
};

// Async thunks
export const fetchAccountMappings = createAsyncThunk(
  'accountMappings/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await accountMappingsApi.getAll();
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch account mappings');
    }
  }
);

export const validateAccountMappings = createAsyncThunk(
  'accountMappings/validate',
  async (_, { rejectWithValue }) => {
    try {
      const response = await accountMappingsApi.validate();
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to validate mappings');
    }
  }
);

export const createAccountMapping = createAsyncThunk(
  'accountMappings/create',
  async (data: CreateAccountMappingDto, { rejectWithValue }) => {
    try {
      const response = await accountMappingsApi.create(data);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create mapping');
    }
  }
);

export const updateAccountMapping = createAsyncThunk(
  'accountMappings/update',
  async ({ id, data }: { id: string; data: UpdateAccountMappingDto }, { rejectWithValue }) => {
    try {
      const response = await accountMappingsApi.update(id, data);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update mapping');
    }
  }
);

export const deleteAccountMapping = createAsyncThunk(
  'accountMappings/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await accountMappingsApi.delete(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete mapping');
    }
  }
);

const accountMappingsSlice = createSlice({
  name: 'accountMappings',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchAccountMappings
      .addCase(fetchAccountMappings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAccountMappings.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          // Handle both { data: T } and direct array response
          const payload = action.payload as any;
          state.mappings = payload.data || payload;
        }
      })
      .addCase(fetchAccountMappings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // validateAccountMappings
      .addCase(validateAccountMappings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(validateAccountMappings.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.validationResult = action.payload;
          state.isValid = action.payload.isComplete;
        }
      })
      .addCase(validateAccountMappings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.isValid = false;
      })

      // createAccountMapping
      .addCase(createAccountMapping.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createAccountMapping.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          // Handle both { data: T } and direct response
          const payload = action.payload as any;
          const mapping = payload.data || payload;
          state.mappings.push(mapping);
        }
      })
      .addCase(createAccountMapping.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // updateAccountMapping
      .addCase(updateAccountMapping.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateAccountMapping.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          // Handle both { data: T } and direct response
          const payload = action.payload as any;
          const mapping = payload.data || payload;
          const index = state.mappings.findIndex((m) => m.id === mapping.id);
          if (index !== -1) {
            state.mappings[index] = mapping;
          }
        }
      })
      .addCase(updateAccountMapping.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // deleteAccountMapping
      .addCase(deleteAccountMapping.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteAccountMapping.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.mappings = state.mappings.filter((m) => m.id !== action.payload);
        }
      })
      .addCase(deleteAccountMapping.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError } = accountMappingsSlice.actions;

// Selectors
export const selectAccountMappings = (state: any) => state.accountMappings?.mappings || [];
export const selectAccountMappingsLoading = (state: any) => state.accountMappings?.loading || false;
export const selectAccountMappingsError = (state: any) => state.accountMappings?.error || null;
export const selectAccountMappingsValid = (state: any) => state.accountMappings?.isValid || false;
export const selectAccountMappingsValidation = (state: any) => state.accountMappings?.validationResult || null;

export default accountMappingsSlice.reducer;
