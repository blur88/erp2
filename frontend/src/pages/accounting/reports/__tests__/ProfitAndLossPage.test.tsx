import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from '@mui/material/styles';
import { darkTheme } from '@/styles/theme';
import ProfitAndLossPage, { ProfitAndLossSection } from '../ProfitAndLossPage';
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
        <ProfitAndLossPage />
      </BrowserRouter>
    </Provider>
  );
};

describe('ProfitAndLossPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders();
    expect(screen.getByText('Profit & Loss Statement')).toBeInTheDocument();
  });

  it('displays page subtitle', () => {
    renderWithProviders();
    expect(
      screen.getByText('View your Income Statement showing Revenue - COGS - Expenses = Net Income for a period')
    ).toBeInTheDocument();
  });

  it('has start date filter', () => {
    renderWithProviders();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
  });

  it('has end date filter', () => {
    renderWithProviders();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
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

  it('renders generate and export buttons in the report actions area', () => {
    renderWithProviders();

    const actions = screen.getByTestId('profit-loss-actions');
    const generateButton = screen.getByRole('button', { name: /generate report/i });
    const exportButton = screen.getByRole('button', { name: /export to excel/i });

    expect(actions).toContainElement(generateButton);
    expect(actions).toContainElement(exportButton);
  });

  it('uses dark-mode contrast text for colored section headers', () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <ProfitAndLossSection
          title="REVENUE"
          accounts={[
            { id: '1', code: '4000', name: 'Sales Revenue', amount: 1000 },
          ]}
          subtotal={1000}
          color="primary"
        />
      </ThemeProvider>
    );

    expect(screen.getByText('REVENUE')).toHaveStyle({ color: '#000' });
  });

  it('avoids light grey subtotal rows in dark mode', () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <ProfitAndLossSection
          title="REVENUE"
          accounts={[
            { id: '1', code: '4000', name: 'Sales Revenue', amount: 1000 },
          ]}
          subtotal={1000}
          color="primary"
        />
      </ThemeProvider>
    );

    const subtotalRow = screen.getByText('Total REVENUE').closest('tr');
    expect(subtotalRow).not.toHaveStyle({ backgroundColor: 'rgb(245, 245, 245)' });
  });
});
