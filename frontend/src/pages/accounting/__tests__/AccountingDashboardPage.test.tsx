import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import AccountingDashboardPage from '../AccountingDashboardPage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';
import journalEntriesReducer from '@/store/slices/journalEntriesSlice';
import fiscalPeriodsReducer from '@/store/slices/fiscalPeriodsSlice';
import { darkTheme } from '@/styles/theme';
import { ApiService } from '@/services/api';

// Mock API Service
vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock formatters
vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  formatDate: (date: string | Date) => typeof date === 'string' ? date : date.toLocaleDateString(),
  getCurrentDate: () => '2026-02-11',
}));

const createMockStore = () => {
  return configureStore({
    reducer: {
      accountingReports: accountingReportsReducer,
      journalEntries: journalEntriesReducer,
      fiscalPeriods: fiscalPeriodsReducer,
    },
  });
};

const renderWithProviders = (useDarkTheme = false) => {
  const store = createMockStore();
  const content = (
    <Provider store={store}>
      <BrowserRouter>
        <AccountingDashboardPage />
      </BrowserRouter>
    </Provider>
  );

  if (useDarkTheme) {
    return render(<ThemeProvider theme={darkTheme}>{content}</ThemeProvider>);
  }

  return render(content);
};

describe('AccountingDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders();
    expect(screen.getByText('Accounting Dashboard')).toBeInTheDocument();
  });

  it('displays page subtitle', () => {
    renderWithProviders();
    expect(
      screen.getByText('Overview of your financial position and accounting activity')
    ).toBeInTheDocument();
  });

  it('displays summary card titles', () => {
    renderWithProviders();
    expect(screen.getByText('Total Assets')).toBeInTheDocument();
    expect(screen.getByText('Total Liabilities')).toBeInTheDocument();
    expect(screen.getByText('Total Equity')).toBeInTheDocument();
    expect(screen.getByText('YTD Net Income')).toBeInTheDocument();
  });

  it('displays quick actions section', () => {
    renderWithProviders();
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  it('has new journal entry button', () => {
    renderWithProviders();
    expect(screen.getByText('New Journal Entry')).toBeInTheDocument();
  });

  it('has view trial balance button', () => {
    renderWithProviders();
    expect(screen.getByText('View Trial Balance')).toBeInTheDocument();
  });

  it('has view balance sheet button', () => {
    renderWithProviders();
    expect(screen.getByText('View Balance Sheet')).toBeInTheDocument();
  });

  it('has view profit and loss button', () => {
    renderWithProviders();
    expect(screen.getByText('View Profit & Loss')).toBeInTheDocument();
  });

  it('displays recent journal entries section', () => {
    renderWithProviders();
    expect(screen.getByText('Recent Journal Entries')).toBeInTheDocument();
  });

  it('displays current fiscal period section', () => {
    renderWithProviders();
    expect(screen.getByText('Current Fiscal Period')).toBeInTheDocument();
  });

  it('uses dark-mode friendly summary icon colors', () => {
    renderWithProviders(true);

    const totalAssetsIconBadge = screen.getByTestId('summary-card-icon-total-assets');
    expect(totalAssetsIconBadge).toHaveStyle({ backgroundColor: 'rgba(66, 165, 245, 0.16)' });
    expect(totalAssetsIconBadge).toHaveStyle({ color: darkTheme.palette.primary.light });
  });

  it('displays balance sheet totals from report response', async () => {
    vi.mocked(ApiService.get).mockImplementation((url: string) => {
      if (url.includes('/balance-sheet')) {
        return Promise.resolve({
          assets: { current: [], fixed: [], totalCurrent: 0, totalFixed: 0, total: 1111.11 },
          liabilities: { current: [], longTerm: [], totalCurrent: 0, totalLongTerm: 0, total: 2222.22 },
          equity: { accounts: [], netIncome: 0, total: 3333.33 },
          isBalanced: true,
        } as any);
      }

      if (url.includes('/profit-loss')) {
        return Promise.resolve({
          startDate: '2026-01-01',
          endDate: '2026-02-11',
          revenue: { accounts: [], subtotal: 0 },
          cogs: { accounts: [], subtotal: 0 },
          expenses: { accounts: [], subtotal: 0 },
          grossProfit: 0,
          operatingIncome: 0,
          netIncome: 4444.44,
        } as any);
      }

      if (url.includes('/journal-entries')) {
        return Promise.resolve({ data: [], meta: {} } as any);
      }

      if (url.includes('/fiscal-periods/current')) {
        return Promise.resolve({
          id: 'period-1',
          name: 'February 2026',
          startDate: '2026-02-01',
          endDate: '2026-02-28',
          status: 'OPEN',
          isOpen: true,
        } as any);
      }

      return Promise.resolve({ data: [], meta: {} } as any);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('$1111.11')).toBeInTheDocument();
      expect(screen.getByText('$2222.22')).toBeInTheDocument();
      expect(screen.getByText('$3333.33')).toBeInTheDocument();
      expect(screen.getByText('$4444.44')).toBeInTheDocument();
    });
  });
});
