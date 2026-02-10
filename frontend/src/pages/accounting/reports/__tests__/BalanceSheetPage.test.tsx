import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import BalanceSheetPage from '../BalanceSheetPage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';

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
    },
  });
};

const renderWithProviders = () => {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <BalanceSheetPage />
      </BrowserRouter>
    </Provider>
  );
};

describe('BalanceSheetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders();
    expect(screen.getByText('Balance Sheet')).toBeInTheDocument();
  });

  it('displays page subtitle', () => {
    renderWithProviders();
    expect(
      screen.getByText('View your financial position showing Assets = Liabilities + Equity as of a specific date')
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
});
