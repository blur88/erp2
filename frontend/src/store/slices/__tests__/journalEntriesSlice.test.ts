import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import journalEntriesReducer, {
  fetchJournalEntries,
  fetchJournalEntryById,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  postEntry,
  reverseEntry,
  setSelectedEntry,
  clearError,
  selectJournalEntries,
  selectSelectedEntry,
  selectJournalEntriesLoading,
} from '../journalEntriesSlice';
import { journalEntriesApi } from '../../../services/accountingApi';

// Mock accountingApi
vi.mock('../../../services/accountingApi', () => ({
  journalEntriesApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
    reverse: vi.fn(),
  },
}));

type TestRootState = {
  journalEntries: ReturnType<typeof journalEntriesReducer>;
};

describe('journalEntriesSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        journalEntries: journalEntriesReducer,
      },
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().journalEntries;

      expect(state.data).toEqual([]);
      expect(state.selectedEntry).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });
  });

  describe('reducers', () => {
    it('should set selected entry', () => {
      const entry = {
        id: '1',
        referenceNumber: 'JE-001',
        description: 'Test Entry',
        entryDate: '2026-02-01',
        status: 'DRAFT' as const,
        fiscalPeriodId: 'fp-1',
        isDraft: true,
        isPosted: false,
        isReversed: false,
        totalDebits: 100,
        totalCredits: 100,
        isBalanced: true,
        createdAt: '2026-02-01',
        updatedAt: '2026-02-01',
      };

      store.dispatch(setSelectedEntry(entry));
      const state = store.getState().journalEntries;
      expect(state.selectedEntry).toEqual(entry);
    });

    it('should clear error', () => {
      store.dispatch(clearError());
      const state = store.getState().journalEntries;
      expect(state.error).toBeNull();
    });
  });

  describe('fetchJournalEntries', () => {
    const mockEntries = [
      {
        id: '1',
        referenceNumber: 'JE-001',
        description: 'Test Entry',
        entryDate: '2026-02-01',
        status: 'DRAFT' as const,
        fiscalPeriodId: 'fp-1',
        isDraft: true,
        isPosted: false,
        isReversed: false,
        totalDebits: 100,
        totalCredits: 100,
        isBalanced: true,
        createdAt: '2026-02-01',
        updatedAt: '2026-02-01',
      },
    ];

    it('should fetch journal entries successfully', async () => {
      (journalEntriesApi.getAll as any).mockResolvedValue({
        data: mockEntries,
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await store.dispatch(fetchJournalEntries({}));

      const state = store.getState().journalEntries;
      expect(state.loading).toBe(false);
      expect(state.data).toEqual(mockEntries);
      expect(state.error).toBeNull();
    });

    it('should handle fetch error', async () => {
      const errorMessage = 'Failed to fetch entries';
      (journalEntriesApi.getAll as any).mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await store.dispatch(fetchJournalEntries({}));

      const state = store.getState().journalEntries;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });
  });

  describe('fetchJournalEntryById', () => {
    const mockEntry = {
      id: '1',
      referenceNumber: 'JE-001',
      description: 'Test Entry',
      entryDate: '2026-02-01',
      status: 'DRAFT' as const,
      fiscalPeriodId: 'fp-1',
      isDraft: true,
      isPosted: false,
      isReversed: false,
      totalDebits: 100,
      totalCredits: 100,
      isBalanced: true,
      lines: [],
      createdAt: '2026-02-01',
      updatedAt: '2026-02-01',
    };

    it('should fetch journal entry by ID successfully', async () => {
      (journalEntriesApi.getById as any).mockResolvedValue(mockEntry);

      await store.dispatch(fetchJournalEntryById('1'));

      const state = store.getState().journalEntries;
      expect(state.loading).toBe(false);
      expect(state.selectedEntry).toEqual(mockEntry);
    });
  });

  describe('createJournalEntry', () => {
    const newEntry = {
      id: '2',
      referenceNumber: 'JE-002',
      description: 'New Entry',
      entryDate: '2026-02-02',
      status: 'DRAFT' as const,
      fiscalPeriodId: 'fp-1',
      isDraft: true,
      isPosted: false,
      isReversed: false,
      totalDebits: 200,
      totalCredits: 200,
      isBalanced: true,
      createdAt: '2026-02-02',
      updatedAt: '2026-02-02',
    };

    it('should create journal entry successfully', async () => {
      (journalEntriesApi.create as any).mockResolvedValue(newEntry);

      await store.dispatch(createJournalEntry({ description: 'New Entry' }));

      const state = store.getState().journalEntries;
      expect(state.data[0]).toEqual(newEntry);
    });
  });

  describe('postEntry', () => {
    const postedEntry = {
      id: '1',
      referenceNumber: 'JE-001',
      description: 'Test Entry',
      entryDate: '2026-02-01',
      status: 'POSTED' as const,
      fiscalPeriodId: 'fp-1',
      isDraft: false,
      isPosted: true,
      isReversed: false,
      totalDebits: 100,
      totalCredits: 100,
      isBalanced: true,
      createdAt: '2026-02-01',
      updatedAt: '2026-02-01',
    };

    it('should post journal entry successfully', async () => {
      (journalEntriesApi.post as any).mockResolvedValue(postedEntry);

      await store.dispatch(postEntry('1'));

      const state = store.getState().journalEntries;
      expect(state.loading).toBe(false);
    });
  });

  describe('reverseEntry', () => {
    const reversedEntry = {
      id: '2',
      referenceNumber: 'JE-002-REV',
      description: 'Reversal of JE-001',
      entryDate: '2026-02-03',
      status: 'POSTED' as const,
      fiscalPeriodId: 'fp-1',
      reversalOfId: '1',
      isDraft: false,
      isPosted: true,
      isReversed: false,
      totalDebits: 100,
      totalCredits: 100,
      isBalanced: true,
      createdAt: '2026-02-03',
      updatedAt: '2026-02-03',
    };

    it('should reverse journal entry successfully', async () => {
      (journalEntriesApi.reverse as any).mockResolvedValue(reversedEntry);

      await store.dispatch(reverseEntry({ id: '1' }));

      const state = store.getState().journalEntries;
      expect(state.loading).toBe(false);
      expect(state.data[0]).toEqual(reversedEntry);
    });
  });

  describe('selectors', () => {
    it('should select journal entries', () => {
      const state = store.getState();
      const entries = selectJournalEntries(state);
      expect(entries).toEqual([]);
    });

    it('should select selected entry', () => {
      const state = store.getState();
      const entry = selectSelectedEntry(state);
      expect(entry).toBeNull();
    });

    it('should select loading state', () => {
      const state = store.getState();
      const loading = selectJournalEntriesLoading(state);
      expect(loading).toBe(false);
    });
  });
});
