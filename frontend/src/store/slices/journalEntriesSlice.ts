import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { JournalEntry, JournalEntryStatus, PaginatedResponse } from '@/types';
import { journalEntriesApi } from '@/services/accountingApi';

interface JournalEntriesState {
  data: JournalEntry[];
  selectedEntry: JournalEntry | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: JournalEntriesState = {
  data: [],
  selectedEntry: null,
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
export const fetchJournalEntries = createAsyncThunk(
  'journalEntries/fetchAll',
  async (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: JournalEntryStatus;
    fiscalPeriodId?: string;
    sourceType?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }, { rejectWithValue }) => {
    try {
      const response = await journalEntriesApi.getAll(params);
      return response || { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    } catch (error: any) {
      console.error('Failed to fetch journal entries:', error);
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch journal entries');
    }
  }
);

export const fetchJournalEntryById = createAsyncThunk(
  'journalEntries/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await journalEntriesApi.getById(id);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch journal entry');
    }
  }
);

export const createJournalEntry = createAsyncThunk(
  'journalEntries/create',
  async (entryData: Partial<JournalEntry>, { rejectWithValue }) => {
    try {
      const response = await journalEntriesApi.create(entryData);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create journal entry');
    }
  }
);

export const updateJournalEntry = createAsyncThunk(
  'journalEntries/update',
  async ({ id, data }: { id: string; data: Partial<JournalEntry> }, { rejectWithValue }) => {
    try {
      const response = await journalEntriesApi.update(id, data);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update journal entry');
    }
  }
);

export const deleteJournalEntry = createAsyncThunk(
  'journalEntries/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await journalEntriesApi.delete(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete journal entry');
    }
  }
);

export const postEntry = createAsyncThunk(
  'journalEntries/post',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await journalEntriesApi.post(id);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to post journal entry');
    }
  }
);

export const reverseEntry = createAsyncThunk(
  'journalEntries/reverse',
  async ({ id, reverseDate }: { id: string; reverseDate?: string }, { rejectWithValue }) => {
    try {
      const response = await journalEntriesApi.reverse(id, reverseDate);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to reverse journal entry');
    }
  }
);

const journalEntriesSlice = createSlice({
  name: 'journalEntries',
  initialState,
  reducers: {
    setSelectedEntry: (state, action: PayloadAction<JournalEntry | null>) => {
      state.selectedEntry = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch all entries
    builder
      .addCase(fetchJournalEntries.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchJournalEntries.fulfilled, (state, action) => {
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
      .addCase(fetchJournalEntries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch entry by ID
    builder
      .addCase(fetchJournalEntryById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchJournalEntryById.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.selectedEntry = action.payload;
          // Update in list if exists
          const index = state.data.findIndex((e) => e.id === action.payload.id);
          if (index >= 0) {
            state.data[index] = action.payload;
          }
        }
      })
      .addCase(fetchJournalEntryById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create entry
    builder
      .addCase(createJournalEntry.fulfilled, (state, action) => {
        if (action.payload) {
          state.data.unshift(action.payload);
        }
      })
      .addCase(createJournalEntry.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Update entry
    builder
      .addCase(updateJournalEntry.fulfilled, (state, action) => {
        if (action.payload) {
          const index = state.data.findIndex((e) => e.id === action.payload.id);
          if (index >= 0) {
            state.data[index] = action.payload;
          }
          if (state.selectedEntry?.id === action.payload.id) {
            state.selectedEntry = action.payload;
          }
        }
      })
      .addCase(updateJournalEntry.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Delete entry
    builder
      .addCase(deleteJournalEntry.fulfilled, (state, action) => {
        if (action.payload) {
          state.data = state.data.filter((e) => e.id !== action.payload);
          if (state.selectedEntry?.id === action.payload) {
            state.selectedEntry = null;
          }
        }
      })
      .addCase(deleteJournalEntry.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Post entry
    builder
      .addCase(postEntry.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(postEntry.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          const index = state.data.findIndex((e) => e.id === action.payload.id);
          if (index >= 0) {
            state.data[index] = action.payload;
          }
          if (state.selectedEntry?.id === action.payload.id) {
            state.selectedEntry = action.payload;
          }
        }
      })
      .addCase(postEntry.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Reverse entry
    builder
      .addCase(reverseEntry.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(reverseEntry.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          // Add the new reversing entry to the list
          state.data.unshift(action.payload);
        }
      })
      .addCase(reverseEntry.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setSelectedEntry, clearError } = journalEntriesSlice.actions;

// Selectors
export const selectJournalEntries = (state: any) => state.journalEntries?.data;
export const selectSelectedEntry = (state: any) => state.journalEntries?.selectedEntry;
export const selectJournalEntriesLoading = (state: any) => state.journalEntries?.loading;
export const selectJournalEntriesError = (state: any) => state.journalEntries?.error;
export const selectJournalEntriesPagination = (state: any) => state.journalEntries?.pagination;

export default journalEntriesSlice.reducer;
