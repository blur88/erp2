import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import AccountActivityPage, {
  getAccountActivityMetricCardSx,
  getAccountActivityToolbarLayout,
} from '../AccountActivityPage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';
import chartOfAccountsReducer from '@/store/slices/chartOfAccountsSlice';

// Mock API
vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn().mockResolvedValue({ data: [], meta: {} }),
  },
}));

const createMockStore = (preloadedState?: any) => {
  return configureStore({
    reducer: {
      accountingReports: accountingReportsReducer,
      chartOfAccounts: chartOfAccountsReducer,
    },
    preloadedState,
  });
};

const renderWithProviders = (preloadedState?: any, mode: 'light' | 'dark' = 'light') => {
  const store = createMockStore(preloadedState);
  const theme = createTheme({
    palette: {
      mode,
    },
  });

  return render(
    <ThemeProvider theme={theme}>
      <Provider store={store}>
        <BrowserRouter>
          <AccountActivityPage />
        </BrowserRouter>
      </Provider>
    </ThemeProvider>
  );
};

describe('AccountActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page correctly', () => {
    const { container } = renderWithProviders();
    // Basic smoke test - page renders something
    expect(container.firstChild).toBeTruthy();
  });

  it('has filter inputs', () => {
    renderWithProviders();
    // Check that date filters are rendered
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
  });

  it('has start date filter', () => {
    renderWithProviders();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
  });

  it('has end date filter', () => {
    renderWithProviders();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
  });

  it('has form filters', () => {
    renderWithProviders();
    // Check that date filters exist
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
  });

  it('has action buttons', () => {
    renderWithProviders();
    // Check that buttons are rendered (they may show loading spinner on mount)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders generate and export buttons in the report actions area', () => {
    renderWithProviders();

    const actions = screen.getByTestId('account-activity-actions');
    const generateButton = screen.getByRole('button', { name: /generate report/i });
    const exportButton = screen.getByRole('button', { name: /export to excel/i });

    expect(actions).toContainElement(generateButton);
    expect(actions).toContainElement(exportButton);
  });

  it('renders safely when account activity response has no entries array', () => {
    renderWithProviders({
      accountingReports: {
        trialBalance: { data: null, loading: false, error: null },
        balanceSheet: { data: null, loading: false, error: null },
        profitAndLoss: { data: null, loading: false, error: null },
        generalLedger: { data: null, loading: false, error: null },
        accountActivity: {
          loading: false,
          error: null,
          data: {
            account: {
              id: 'acc-1',
              code: '1000',
              name: 'Cash',
              type: 'ASSET',
            },
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            totalEntries: 0,
          },
        },
        downloading: false,
      },
      chartOfAccounts: {
        accounts: [],
        selectedAccount: null,
        loading: false,
        error: null,
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      },
    });

    expect(screen.getByText('No entries found for the selected period')).toBeInTheDocument();
  });

  it('uses dark-friendly table header colors in dark mode', () => {
    renderWithProviders(
      {
        accountingReports: {
          trialBalance: { data: null, loading: false, error: null },
          balanceSheet: { data: null, loading: false, error: null },
          profitAndLoss: { data: null, loading: false, error: null },
          generalLedger: { data: null, loading: false, error: null },
          accountActivity: {
            loading: false,
            error: null,
            data: {
              account: {
                id: 'acc-1',
                code: '1000',
                name: 'Cash',
                type: 'ASSET',
              },
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              totalEntries: 1,
              entries: [
                {
                  id: 'entry-1',
                  entryDate: '2026-01-15',
                  entryNumber: 'JE-0001',
                  entryType: 'MANUAL',
                  status: 'POSTED',
                  description: 'Opening balance',
                  debitAmount: 1000,
                  creditAmount: 0,
                },
              ],
            },
          },
          downloading: false,
        },
        chartOfAccounts: {
          accounts: [],
          selectedAccount: null,
          loading: false,
          error: null,
          pagination: {
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0,
          },
        },
      },
      'dark'
    );

    const headerCell = screen.getByText('Entry Date').closest('th');
    expect(headerCell).not.toHaveStyle({ backgroundColor: 'rgb(238, 238, 238)' });
  });

  it('uses compact shared metric card sizing for consistent box heights', () => {
    const metricCardSx = getAccountActivityMetricCardSx();

    expect(metricCardSx.height).toBe('100%');
    expect(metricCardSx.minHeight).toBe(88);
    expect(metricCardSx.display).toBe('flex');
    expect(metricCardSx['& .MuiCardContent-root']).toEqual(
      expect.objectContaining({
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        padding: 1.5,
      })
    );
  });

  it('keeps date and status filters together and moves actions to next row on reduced widths', () => {
    const toolbarLayout = getAccountActivityToolbarLayout();

    expect(toolbarLayout.containerDirection).toEqual({ xs: 'column', lg: 'row' });
    expect(toolbarLayout.filtersWrap).toEqual({ xs: 'wrap', md: 'nowrap' });
    expect(toolbarLayout.dateStatusDirection).toEqual({ xs: 'row', sm: 'row' });
    expect(toolbarLayout.dateStatusWrap).toBe('nowrap');
    expect(toolbarLayout.actionsJustify).toEqual({ xs: 'flex-start', md: 'flex-start' });
  });
});
