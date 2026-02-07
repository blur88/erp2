import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import accountMappingsReducer, {
  fetchAccountMappings,
  validateAccountMappings,
  createAccountMapping,
  updateAccountMapping,
  deleteAccountMapping,
  clearError,
  selectAccountMappings,
  selectAccountMappingsLoading,
  selectAccountMappingsError,
  selectAccountMappingsValid,
  selectAccountMappingsValidation,
} from './accountMappingsSlice';
import { accountMappingsApi } from '@/services/accountingApi';
import { MappingType } from '@/types/accountMapping';

// Mock the API
vi.mock('@/services/accountingApi', () => ({
  accountMappingsApi: {
    getAll: vi.fn(),
    validate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('accountMappingsSlice', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        accountMappings: accountMappingsReducer,
      },
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().accountMappings;
      expect(state.mappings).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.isValid).toBe(false);
      expect(state.validationResult).toBeNull();
    });
  });

  describe('fetchAccountMappings', () => {
    const mockMappings = [
      {
        id: '1',
        mappingType: MappingType.SALES_REVENUE,
        accountId: 'acc-1',
        description: 'Sales revenue account',
        isActive: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
      {
        id: '2',
        mappingType: MappingType.SALES_AR,
        accountId: 'acc-2',
        description: 'Accounts receivable',
        isActive: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
    ];

    it('should set loading to true on pending', async () => {
      vi.mocked(accountMappingsApi.getAll).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      store.dispatch(fetchAccountMappings());
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should update mappings on fulfilled with { data: T } format', async () => {
      vi.mocked(accountMappingsApi.getAll).mockResolvedValue({
        data: mockMappings,
      });

      await store.dispatch(fetchAccountMappings());
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.mappings).toEqual(mockMappings);
      expect(state.error).toBeNull();
    });

    it('should update mappings on fulfilled with direct array format', async () => {
      vi.mocked(accountMappingsApi.getAll).mockResolvedValue(mockMappings as any);

      await store.dispatch(fetchAccountMappings());
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.mappings).toEqual(mockMappings);
      expect(state.error).toBeNull();
    });

    it('should set error on rejected', async () => {
      const errorMessage = 'Failed to fetch mappings';
      vi.mocked(accountMappingsApi.getAll).mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await store.dispatch(fetchAccountMappings());
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
      expect(state.mappings).toEqual([]);
    });
  });

  describe('validateAccountMappings', () => {
    const validationResult = {
      isComplete: true,
      missingMappings: [],
      configuredMappings: ['sales_revenue', 'sales_ar'],
    };

    it('should set loading to true on pending', async () => {
      vi.mocked(accountMappingsApi.validate).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      store.dispatch(validateAccountMappings());
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should update validation result and isValid flag on fulfilled', async () => {
      vi.mocked(accountMappingsApi.validate).mockResolvedValue(validationResult);

      await store.dispatch(validateAccountMappings());
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.validationResult).toEqual(validationResult);
      expect(state.isValid).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should set isValid to false when mappings incomplete', async () => {
      const incompleteResult = {
        isComplete: false,
        missingMappings: ['sales_revenue', 'sales_ar'],
        configuredMappings: [],
      };
      vi.mocked(accountMappingsApi.validate).mockResolvedValue(incompleteResult);

      await store.dispatch(validateAccountMappings());
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.validationResult).toEqual(incompleteResult);
      expect(state.isValid).toBe(false);
    });

    it('should set error and isValid to false on rejected', async () => {
      const errorMessage = 'Validation failed';
      vi.mocked(accountMappingsApi.validate).mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await store.dispatch(validateAccountMappings());
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
      expect(state.isValid).toBe(false);
    });
  });

  describe('createAccountMapping', () => {
    const newMappingDto = {
      mappingType: MappingType.SALES_REVENUE,
      accountId: 'acc-1',
      description: 'Sales revenue',
    };

    const createdMapping = {
      id: '1',
      ...newMappingDto,
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    it('should set loading to true on pending', async () => {
      vi.mocked(accountMappingsApi.create).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      store.dispatch(createAccountMapping(newMappingDto));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should add mapping to array on fulfilled', async () => {
      vi.mocked(accountMappingsApi.create).mockResolvedValue(createdMapping);

      await store.dispatch(createAccountMapping(newMappingDto));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.mappings).toHaveLength(1);
      expect(state.mappings[0]).toEqual(createdMapping);
      expect(state.error).toBeNull();
    });

    it('should handle { data: T } response format', async () => {
      vi.mocked(accountMappingsApi.create).mockResolvedValue({
        data: createdMapping,
      } as any);

      await store.dispatch(createAccountMapping(newMappingDto));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.mappings).toHaveLength(1);
      expect(state.mappings[0]).toEqual(createdMapping);
    });

    it('should set error on rejected', async () => {
      const errorMessage = 'Failed to create mapping';
      vi.mocked(accountMappingsApi.create).mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await store.dispatch(createAccountMapping(newMappingDto));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });
  });

  describe('updateAccountMapping', () => {
    const existingMapping = {
      id: '1',
      mappingType: MappingType.SALES_REVENUE,
      accountId: 'acc-1',
      description: 'Sales revenue',
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    const updateDto = {
      accountId: 'acc-2',
      description: 'Updated description',
    };

    const updatedMapping = {
      ...existingMapping,
      ...updateDto,
      updatedAt: '2024-01-02',
    };

    beforeEach(async () => {
      // Setup initial state with one mapping
      vi.mocked(accountMappingsApi.getAll).mockResolvedValue({
        data: [existingMapping],
      });
      await store.dispatch(fetchAccountMappings());
    });

    it('should set loading to true on pending', async () => {
      vi.mocked(accountMappingsApi.update).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      store.dispatch(updateAccountMapping({ id: '1', data: updateDto }));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should update existing mapping on fulfilled', async () => {
      vi.mocked(accountMappingsApi.update).mockResolvedValue(updatedMapping);

      await store.dispatch(updateAccountMapping({ id: '1', data: updateDto }));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.mappings).toHaveLength(1);
      expect(state.mappings[0]).toEqual(updatedMapping);
      expect(state.error).toBeNull();
    });

    it('should handle { data: T } response format', async () => {
      vi.mocked(accountMappingsApi.update).mockResolvedValue({
        data: updatedMapping,
      } as any);

      await store.dispatch(updateAccountMapping({ id: '1', data: updateDto }));
      const state = store.getState().accountMappings;
      expect(state.mappings[0]).toEqual(updatedMapping);
    });

    it('should set error on rejected', async () => {
      const errorMessage = 'Failed to update mapping';
      vi.mocked(accountMappingsApi.update).mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await store.dispatch(updateAccountMapping({ id: '1', data: updateDto }));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });
  });

  describe('deleteAccountMapping', () => {
    const mapping1 = {
      id: '1',
      mappingType: MappingType.SALES_REVENUE,
      accountId: 'acc-1',
      description: 'Sales revenue',
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    const mapping2 = {
      id: '2',
      mappingType: MappingType.SALES_AR,
      accountId: 'acc-2',
      description: 'Accounts receivable',
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    beforeEach(async () => {
      // Setup initial state with two mappings
      vi.mocked(accountMappingsApi.getAll).mockResolvedValue({
        data: [mapping1, mapping2],
      });
      await store.dispatch(fetchAccountMappings());
    });

    it('should set loading to true on pending', async () => {
      vi.mocked(accountMappingsApi.delete).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      store.dispatch(deleteAccountMapping('1'));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should remove mapping from array on fulfilled', async () => {
      vi.mocked(accountMappingsApi.delete).mockResolvedValue();

      await store.dispatch(deleteAccountMapping('1'));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.mappings).toHaveLength(1);
      expect(state.mappings[0].id).toBe('2');
      expect(state.error).toBeNull();
    });

    it('should set error on rejected', async () => {
      const errorMessage = 'Failed to delete mapping';
      vi.mocked(accountMappingsApi.delete).mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await store.dispatch(deleteAccountMapping('1'));
      const state = store.getState().accountMappings;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
      expect(state.mappings).toHaveLength(2); // No change
    });
  });

  describe('reducers', () => {
    it('should clear error', () => {
      // First set an error
      store.dispatch({
        type: fetchAccountMappings.rejected.type,
        payload: 'Some error',
      });
      expect(store.getState().accountMappings.error).toBe('Some error');

      // Then clear it
      store.dispatch(clearError());
      expect(store.getState().accountMappings.error).toBeNull();
    });
  });

  describe('selectors', () => {
    const mockState = {
      accountMappings: {
        mappings: [
          {
            id: '1',
            mappingType: MappingType.SALES_REVENUE,
            accountId: 'acc-1',
            description: 'Sales revenue',
            isActive: true,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
        loading: true,
        error: 'Test error',
        isValid: true,
        validationResult: {
          isComplete: true,
          missingMappings: [],
          configuredMappings: ['sales_revenue'],
        },
      },
    };

    it('should select mappings', () => {
      expect(selectAccountMappings(mockState)).toEqual(mockState.accountMappings.mappings);
    });

    it('should select loading state', () => {
      expect(selectAccountMappingsLoading(mockState)).toBe(true);
    });

    it('should select error', () => {
      expect(selectAccountMappingsError(mockState)).toBe('Test error');
    });

    it('should select isValid flag', () => {
      expect(selectAccountMappingsValid(mockState)).toBe(true);
    });

    it('should select validation result', () => {
      expect(selectAccountMappingsValidation(mockState)).toEqual(
        mockState.accountMappings.validationResult
      );
    });

    it('should return defaults for undefined state', () => {
      const emptyState = {};
      expect(selectAccountMappings(emptyState)).toEqual([]);
      expect(selectAccountMappingsLoading(emptyState)).toBe(false);
      expect(selectAccountMappingsError(emptyState)).toBeNull();
      expect(selectAccountMappingsValid(emptyState)).toBe(false);
      expect(selectAccountMappingsValidation(emptyState)).toBeNull();
    });
  });
});
