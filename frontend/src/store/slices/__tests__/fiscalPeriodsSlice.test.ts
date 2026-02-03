import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import fiscalPeriodsReducer, {
  fetchFiscalPeriods,
  fetchFiscalPeriodById,
  fetchCurrentPeriod,
  createFiscalPeriod,
  updateFiscalPeriod,
  deleteFiscalPeriod,
  closePeriod,
  reopenPeriod,
  generatePeriods,
  setSelectedPeriod,
  clearError,
  selectFiscalPeriods,
  selectCurrentPeriod,
  selectSelectedPeriod,
  selectFiscalPeriodsLoading,
} from '../fiscalPeriodsSlice';
import { fiscalPeriodsApi } from '../../../services/accountingApi';

// Mock accountingApi
vi.mock('../../../services/accountingApi', () => ({
  fiscalPeriodsApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getCurrent: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    close: vi.fn(),
    reopen: vi.fn(),
    generate: vi.fn(),
  },
}));

type TestRootState = {
  fiscalPeriods: ReturnType<typeof fiscalPeriodsReducer>;
};

describe('fiscalPeriodsSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        fiscalPeriods: fiscalPeriodsReducer,
      },
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().fiscalPeriods;

      expect(state.data).toEqual([]);
      expect(state.currentPeriod).toBeNull();
      expect(state.selectedPeriod).toBeNull();
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
    it('should set selected period', () => {
      const period = {
        id: '1',
        code: '2026-01',
        name: 'January 2026',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'OPEN' as const,
        isOpen: true,
        isClosed: false,
        durationDays: 31,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };

      store.dispatch(setSelectedPeriod(period));
      const state = store.getState().fiscalPeriods;
      expect(state.selectedPeriod).toEqual(period);
    });

    it('should clear error', () => {
      store.dispatch(clearError());
      const state = store.getState().fiscalPeriods;
      expect(state.error).toBeNull();
    });
  });

  describe('fetchFiscalPeriods', () => {
    const mockPeriods = [
      {
        id: '1',
        code: '2026-01',
        name: 'January 2026',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'OPEN' as const,
        isOpen: true,
        isClosed: false,
        durationDays: 31,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    it('should fetch fiscal periods successfully', async () => {
      (fiscalPeriodsApi.getAll as any).mockResolvedValue({
        data: mockPeriods,
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await store.dispatch(fetchFiscalPeriods({}));

      const state = store.getState().fiscalPeriods;
      expect(state.loading).toBe(false);
      expect(state.data).toEqual(mockPeriods);
      expect(state.error).toBeNull();
    });

    it('should handle fetch error', async () => {
      const errorMessage = 'Failed to fetch periods';
      (fiscalPeriodsApi.getAll as any).mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await store.dispatch(fetchFiscalPeriods({}));

      const state = store.getState().fiscalPeriods;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });
  });

  describe('fetchFiscalPeriodById', () => {
    const mockPeriod = {
      id: '1',
      code: '2026-01',
      name: 'January 2026',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'OPEN' as const,
      isOpen: true,
      isClosed: false,
      durationDays: 31,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    it('should fetch fiscal period by ID successfully', async () => {
      (fiscalPeriodsApi.getById as any).mockResolvedValue(mockPeriod);

      await store.dispatch(fetchFiscalPeriodById('1'));

      const state = store.getState().fiscalPeriods;
      expect(state.loading).toBe(false);
      expect(state.selectedPeriod).toEqual(mockPeriod);
    });
  });

  describe('fetchCurrentPeriod', () => {
    const currentPeriod = {
      id: '1',
      code: '2026-02',
      name: 'February 2026',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      status: 'OPEN' as const,
      isOpen: true,
      isClosed: false,
      durationDays: 28,
      createdAt: '2026-02-01',
      updatedAt: '2026-02-01',
    };

    it('should fetch current period successfully', async () => {
      (fiscalPeriodsApi.getCurrent as any).mockResolvedValue(currentPeriod);

      await store.dispatch(fetchCurrentPeriod());

      const state = store.getState().fiscalPeriods;
      expect(state.loading).toBe(false);
      expect(state.currentPeriod).toEqual(currentPeriod);
    });
  });

  describe('createFiscalPeriod', () => {
    const newPeriod = {
      id: '2',
      code: '2026-03',
      name: 'March 2026',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'OPEN' as const,
      isOpen: true,
      isClosed: false,
      durationDays: 31,
      createdAt: '2026-03-01',
      updatedAt: '2026-03-01',
    };

    it('should create fiscal period successfully', async () => {
      (fiscalPeriodsApi.create as any).mockResolvedValue(newPeriod);

      await store.dispatch(createFiscalPeriod({ code: '2026-03', name: 'March 2026' }));

      const state = store.getState().fiscalPeriods;
      expect(state.data[0]).toEqual(newPeriod);
    });
  });

  describe('closePeriod', () => {
    const closedPeriod = {
      id: '1',
      code: '2026-01',
      name: 'January 2026',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'CLOSED' as const,
      isOpen: false,
      isClosed: true,
      durationDays: 31,
      createdAt: '2026-01-01',
      updatedAt: '2026-02-01',
    };

    it('should close fiscal period successfully', async () => {
      (fiscalPeriodsApi.close as any).mockResolvedValue(closedPeriod);

      await store.dispatch(closePeriod('1'));

      const state = store.getState().fiscalPeriods;
      expect(state.loading).toBe(false);
    });
  });

  describe('reopenPeriod', () => {
    const reopenedPeriod = {
      id: '1',
      code: '2026-01',
      name: 'January 2026',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'OPEN' as const,
      isOpen: true,
      isClosed: false,
      durationDays: 31,
      createdAt: '2026-01-01',
      updatedAt: '2026-02-01',
    };

    it('should reopen fiscal period successfully', async () => {
      (fiscalPeriodsApi.reopen as any).mockResolvedValue(reopenedPeriod);

      await store.dispatch(reopenPeriod('1'));

      const state = store.getState().fiscalPeriods;
      expect(state.loading).toBe(false);
    });
  });

  describe('generatePeriods', () => {
    const generatedPeriods = [
      {
        id: '1',
        code: '2026-01',
        name: 'January 2026',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'OPEN' as const,
        isOpen: true,
        isClosed: false,
        durationDays: 31,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: '2',
        code: '2026-02',
        name: 'February 2026',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        status: 'OPEN' as const,
        isOpen: true,
        isClosed: false,
        durationDays: 28,
        createdAt: '2026-02-01',
        updatedAt: '2026-02-01',
      },
    ];

    it('should generate fiscal periods successfully', async () => {
      (fiscalPeriodsApi.generate as any).mockResolvedValue({
        data: generatedPeriods,
        message: 'Generated 12 periods',
      });

      await store.dispatch(generatePeriods({ year: 2026 }));

      const state = store.getState().fiscalPeriods;
      expect(state.loading).toBe(false);
      expect(state.data.length).toBeGreaterThan(0);
    });
  });

  describe('selectors', () => {
    it('should select fiscal periods', () => {
      const state = store.getState();
      const periods = selectFiscalPeriods(state);
      expect(periods).toEqual([]);
    });

    it('should select current period', () => {
      const state = store.getState();
      const period = selectCurrentPeriod(state);
      expect(period).toBeNull();
    });

    it('should select selected period', () => {
      const state = store.getState();
      const period = selectSelectedPeriod(state);
      expect(period).toBeNull();
    });

    it('should select loading state', () => {
      const state = store.getState();
      const loading = selectFiscalPeriodsLoading(state);
      expect(loading).toBe(false);
    });
  });
});
