import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import AccountingDashboardPage from '../AccountingDashboardPage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';
import journalEntriesReducer from '@/store/slices/journalEntriesSlice';
import fiscalPeriodsReducer from '@/store/slices/fiscalPeriodsSlice';
import { darkTheme } from '@/styles/theme';

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
});
