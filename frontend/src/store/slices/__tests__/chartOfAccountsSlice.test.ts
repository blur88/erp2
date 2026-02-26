import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chartOfAccountsReducer, {
  fetchChartOfAccounts,
  fetchAccountById,
  fetchAccountHierarchy,
  createAccount,
  updateAccount,
  deleteAccount,
  restoreAccount,
  seedDefaultAccounts,
  setSelectedAccount,
  clearError,
  selectChartOfAccounts,
  selectAccountHierarchy,
  selectChartOfAccountsLoading,
} from '../chartOfAccountsSlice';
import { ApiService } from '../../../services/api';

// Mock ApiService
vi.mock('../../../services/api', () => ({
  ApiService: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

type TestRootState = {
  chartOfAccounts: ReturnType<typeof chartOfAccountsReducer>;
};

describe('chartOfAccountsSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        chartOfAccounts: chartOfAccountsReducer,
      },
    });
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().chartOfAccounts;

      expect(state.data).toEqual([]);
      expect(state.hierarchy).toEqual([]);
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
    it('should clear error', () => {
      store.dispatch(clearError());
      const state = store.getState().chartOfAccounts;
      expect(state.error).toBeNull();
    });
  });

  describe('fetchChartOfAccounts', () => {
    const mockAccounts = [
      {
        id: '1',
        code: '1000',
        name: 'Cash',
        type: 'asset' as const,
        isActive: true,
        fullCode: '1000',
        isParent: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    it('should fetch chart of accounts successfully', async () => {
      (ApiService.get as any).mockResolvedValue({
        data: mockAccounts,
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await store.dispatch(fetchChartOfAccounts({}));

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
      expect(state.data).toEqual(mockAccounts);
      expect(state.error).toBeNull();
    });

    it('should handle fetch error', async () => {
      const errorMessage = 'Failed to fetch accounts';
      (ApiService.get as any).mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await store.dispatch(fetchChartOfAccounts({}));

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });
  });

  describe('fetchAccountById', () => {
    const mockAccount = {
      id: '1',
      code: '1000',
      name: 'Cash',
      type: 'asset' as const,
      isActive: true,
      fullCode: '1000',
      isParent: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    it('should fetch account by ID successfully', async () => {
      (ApiService.get as any).mockResolvedValue(mockAccount);

      await store.dispatch(fetchAccountById('1'));

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('fetchAccountHierarchy', () => {
    const mockHierarchy = [
      {
        id: '1',
        code: '1000',
        name: 'Assets',
        type: 'asset' as const,
        isActive: true,
        fullCode: '1000',
        isParent: true,
        children: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    it('should fetch account hierarchy successfully', async () => {
      (ApiService.get as any).mockResolvedValue(mockHierarchy);

      await store.dispatch(fetchAccountHierarchy());

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
      expect(state.hierarchy).toEqual(mockHierarchy);
    });
  });

  describe('createAccount', () => {
    const newAccount = {
      id: '2',
      code: '2000',
      name: 'Accounts Payable',
      type: 'liability' as const,
      isActive: true,
      fullCode: '2000',
      isParent: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    it('should create account successfully', async () => {
      (ApiService.post as any).mockResolvedValue(newAccount);

      await store.dispatch(createAccount({ code: '2000', name: 'Accounts Payable', type: 'liability' as const }));

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
      expect(state.data[0]).toEqual(newAccount);
    });
  });

  describe('updateAccount', () => {
    it('should update account successfully', async () => {
      const updatedAccount = {
        id: '1',
        code: '1000',
        name: 'Cash Updated',
        type: 'asset' as const,
        isActive: true,
        fullCode: '1000',
        isParent: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
      };

      (ApiService.patch as any).mockResolvedValue(updatedAccount);

      // First add an account to the state
      store.dispatch({ type: 'chartOfAccounts/create/fulfilled', payload: updatedAccount });

      await store.dispatch(updateAccount({ id: '1', data: { name: 'Cash Updated' } }));

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
    });
  });

  describe('deleteAccount', () => {
    it('should delete account successfully', async () => {
      (ApiService.delete as any).mockResolvedValue(undefined);

      await store.dispatch(deleteAccount('1'));

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
    });
  });

  describe('restoreAccount', () => {
    const restoredAccount = {
      id: '1',
      code: '1000',
      name: 'Cash',
      type: 'asset' as const,
      isActive: true,
      fullCode: '1000',
      isParent: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    it('should restore account successfully', async () => {
      (ApiService.post as any).mockResolvedValue(restoredAccount);

      await store.dispatch(restoreAccount('1'));

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
      expect(state.data).toContainEqual(restoredAccount);
    });
  });

  describe('seedDefaultAccounts', () => {
    it('should seed default accounts successfully', async () => {
      (ApiService.post as any).mockResolvedValue({
        message: 'Seeded successfully',
        count: 5,
      });

      await store.dispatch(seedDefaultAccounts());

      const state = store.getState().chartOfAccounts;
      expect(state.loading).toBe(false);
    });
  });

  describe('selectors', () => {
    it('should select chart of accounts', () => {
      const state = store.getState();
      const accounts = selectChartOfAccounts(state);
      expect(accounts).toEqual([]);
    });

    it('should select account hierarchy', () => {
      const state = store.getState();
      const hierarchy = selectAccountHierarchy(state);
      expect(hierarchy).toEqual([]);
    });

    it('should select loading state', () => {
      const state = store.getState();
      const loading = selectChartOfAccountsLoading(state);
      expect(loading).toBe(false);
    });

    it('returns stable empty array reference when chartOfAccounts slice is missing', () => {
      const emptyState = {} as any;
      const first = selectChartOfAccounts(emptyState);
      const second = selectChartOfAccounts(emptyState);
      expect(first).toBe(second);
    });
  });
});
