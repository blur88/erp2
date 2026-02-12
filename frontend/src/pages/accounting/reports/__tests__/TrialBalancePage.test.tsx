import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import TrialBalancePage from '../TrialBalancePage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';
import { ApiService } from '@/services/api';

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
    },
    preloadedState,
  });
};

const renderWithProviders = () => {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <TrialBalancePage />
      </BrowserRouter>
    </Provider>
  );
};

describe('TrialBalancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders();
    expect(screen.getByText('Trial Balance')).toBeInTheDocument();
  });

  it('displays page subtitle', () => {
    renderWithProviders();
    expect(
      screen.getByText('View account balances and verify debits equal credits as of a specific date')
    ).toBeInTheDocument();
  });

  it('has as of date filter', () => {
    renderWithProviders();
    expect(screen.getByLabelText('As Of Date')).toBeInTheDocument();
  });

  it('has include inactive checkbox', () => {
    renderWithProviders();
    expect(screen.getByLabelText('Include Inactive Accounts')).toBeInTheDocument();
  });

  it('has action buttons', () => {
    renderWithProviders();
    // Check that buttons are rendered (they may show loading spinner on mount)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('uses a dark-mode-friendly background color for totals row', async () => {
    const darkTheme = createTheme({ palette: { mode: 'dark' } });
    vi.mocked(ApiService.get).mockResolvedValueOnce({
      accounts: [
        {
          accountCode: '1000',
          accountName: 'Cash',
          accountType: 'Asset',
          debit: 100,
          credit: 0,
        },
      ],
      totalDebit: 100,
      totalCredit: 100,
      isBalanced: true,
    } as any);
    const store = createMockStore();

    render(
      <ThemeProvider theme={darkTheme}>
        <Provider store={store}>
          <BrowserRouter>
            <TrialBalancePage />
          </BrowserRouter>
        </Provider>
      </ThemeProvider>
    );

    const totalCell = await screen.findByText('Total');
    const totalRow = totalCell.closest('tr');
    expect(totalRow).toHaveStyle({
      backgroundColor: darkTheme.palette.action.hover,
    });
  });
});
