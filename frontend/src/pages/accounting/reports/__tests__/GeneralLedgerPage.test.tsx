import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import GeneralLedgerPage from '../GeneralLedgerPage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';
import chartOfAccountsReducer from '@/store/slices/chartOfAccountsSlice';

// Mock API
vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn().mockResolvedValue({ data: [], meta: {} }),
  },
}));

const createMockStore = () => {
  return configureStore({
    reducer: {
      accountingReports: accountingReportsReducer,
      chartOfAccounts: chartOfAccountsReducer,
    },
  });
};

const renderWithProviders = () => {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <GeneralLedgerPage />
      </BrowserRouter>
    </Provider>
  );
};

describe('GeneralLedgerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders();
    expect(screen.getByText('General Ledger')).toBeInTheDocument();
  });

  it('displays page subtitle', () => {
    renderWithProviders();
    expect(
      screen.getByText('View all transactions for a specific account with running balance')
    ).toBeInTheDocument();
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

  it('has action buttons', () => {
    renderWithProviders();
    // Check that buttons are rendered (they may show loading spinner on mount)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
