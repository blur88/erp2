import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';

import AccountingDashboardPage from '../AccountingDashboardPage';
import { darkTheme } from '@/styles/theme';

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  formatDate: (date: string | Date | null | undefined) =>
    !date ? '-' : typeof date === 'string' ? date : date.toLocaleDateString(),
  getCurrentDate: () => '2026-02-11',
}));

vi.mock('@/hooks/useSearchAndFilter', async () => {
  const actual = await vi.importActual('@/hooks/useSearchAndFilter');
  return {
    ...actual,
    useKeyboardShortcuts: vi.fn(),
  };
});

const mockedApi = vi.hoisted(() => ({
  useGetBalanceSheetQuery: vi.fn(),
  useGetProfitAndLossQuery: vi.fn(),
  useGetJournalEntriesQuery: vi.fn(),
  useGetCurrentFiscalPeriodQuery: vi.fn(),
  useGetPendingSettlementSummaryQuery: vi.fn(),
}));

vi.mock('@/store/api/accountingApi', () => ({
  useGetBalanceSheetQuery: mockedApi.useGetBalanceSheetQuery,
  useGetProfitAndLossQuery: mockedApi.useGetProfitAndLossQuery,
  useGetJournalEntriesQuery: mockedApi.useGetJournalEntriesQuery,
  useGetCurrentFiscalPeriodQuery: mockedApi.useGetCurrentFiscalPeriodQuery,
  useGetPendingSettlementSummaryQuery: mockedApi.useGetPendingSettlementSummaryQuery,
}));

const renderWithProviders = (useDarkTheme = false) => {
  const content = (
    <BrowserRouter>
      <AccountingDashboardPage />
    </BrowserRouter>
  );

  if (useDarkTheme) {
    return render(<ThemeProvider theme={darkTheme}>{content}</ThemeProvider>);
  }

  return render(content);
};

describe('AccountingDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.useGetBalanceSheetQuery.mockReturnValue({
      data: {
        assets: { current: [], fixed: [], totalCurrent: 0, totalFixed: 0, total: 1111.11 },
        liabilities: { current: [], longTerm: [], totalCurrent: 0, totalLongTerm: 0, total: 2222.22 },
        equity: { accounts: [], netIncome: 0, total: 3333.33 },
        isBalanced: true,
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    });
    mockedApi.useGetProfitAndLossQuery.mockReturnValue({
      data: {
        startDate: '2026-01-01',
        endDate: '2026-02-11',
        revenue: { accounts: [], subtotal: 0 },
        cogs: { accounts: [], subtotal: 0 },
        expenses: { accounts: [], subtotal: 0 },
        grossProfit: 0,
        operatingIncome: 0,
        netIncome: 4444.44,
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    });
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: {
        data: [],
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    });
    mockedApi.useGetCurrentFiscalPeriodQuery.mockReturnValue({
      data: {
        id: 'period-1',
        name: 'February 2026',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        status: 'OPEN',
        isOpen: true,
      },
      isLoading: false,
    });
    mockedApi.useGetPendingSettlementSummaryQuery.mockReturnValue({
      data: [],
    });
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

  it('displays balance sheet totals from report response', () => {
    renderWithProviders();

    expect(screen.getByText('$1111.11')).toBeInTheDocument();
    expect(screen.getByText('$2222.22')).toBeInTheDocument();
    expect(screen.getByText('$3333.33')).toBeInTheDocument();
    expect(screen.getByText('$4444.44')).toBeInTheDocument();
  });
});
