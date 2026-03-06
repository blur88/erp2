import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import BalanceSheetPage from './BalanceSheetPage';

const mockedApi = vi.hoisted(() => ({
  useGetBalanceSheetQuery: vi.fn(),
}));

vi.mock('@/store/api/accountingApi', () => ({
  useGetBalanceSheetQuery: mockedApi.useGetBalanceSheetQuery,
}));

const reportData = {
  assets: {
    accounts: [{ id: 'a1', code: '1000', name: 'Cash', balance: 5000 }],
    subtotal: 5000,
  },
  liabilities: {
    accounts: [{ id: 'l1', code: '2000', name: 'Accounts Payable', balance: 2000 }],
    subtotal: 2000,
  },
  equity: {
    accounts: [{ id: 'e1', code: '3000', name: 'Owner Equity', balance: 2500 }],
    subtotal: 2500,
    netIncome: 500,
  },
  totalAssets: 5000,
  totalLiabilitiesAndEquity: 4500,
  isBalanced: false,
};

describe('BalanceSheetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.useGetBalanceSheetQuery.mockReturnValue({
      data: reportData,
      isLoading: false,
      error: undefined,
    });
  });

  it('uses uniform-height cards for assets, liabilities, and equity sections', async () => {
    render(<BalanceSheetPage />);

    await waitFor(() => {
      expect(screen.getByTestId('balance-sheet-section-assets')).toBeInTheDocument();
    });

    const assetsCard = screen.getByTestId('balance-sheet-section-assets');
    const liabilitiesCard = screen.getByTestId('balance-sheet-section-liabilities');
    const equityCard = screen.getByTestId('balance-sheet-section-equity');

    expect(assetsCard).toHaveStyle({ height: '100%', display: 'flex', flexDirection: 'column' });
    expect(liabilitiesCard).toHaveStyle({ height: '100%', display: 'flex', flexDirection: 'column' });
    expect(equityCard).toHaveStyle({ height: '100%', display: 'flex', flexDirection: 'column' });
  });

  it('renders net income in a highlighted summary panel', async () => {
    render(<BalanceSheetPage />);

    await waitFor(() => {
      expect(screen.getByTestId('balance-sheet-net-income')).toBeInTheDocument();
    });

    expect(screen.getByTestId('balance-sheet-net-income-label')).toHaveTextContent('Net Income');
    expect(screen.getByTestId('balance-sheet-net-income-value')).toHaveTextContent('500.00');
  });

  it('keeps balance check footer card height consistent with totals cards', async () => {
    render(<BalanceSheetPage />);

    await waitFor(() => {
      expect(screen.getByTestId('balance-sheet-total-assets')).toBeInTheDocument();
    });

    expect(screen.getByTestId('balance-sheet-total-assets')).toHaveStyle({ height: '100%' });
    expect(screen.getByTestId('balance-sheet-total-liabilities-equity')).toHaveStyle({ height: '100%' });
    expect(screen.getByTestId('balance-sheet-balance-check')).toHaveStyle({ height: '100%' });
  });
});
