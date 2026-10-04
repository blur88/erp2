import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReconciliationSummary from '../ReconciliationSummary'

describe('ReconciliationSummary', () => {
  it('renders all required summary metrics', () => {
    render(
      <ReconciliationSummary
        moneyIn="150.00"
        moneyOut="50.00"
        calculatedClosingBalance="1100.00"
        difference="0.00"
        openingBalanceDifference="0.00"
        unclassifiedCount={0}
      />,
    )

    expect(screen.getByTestId('summary-money-in')).toHaveTextContent('150.00')
    expect(screen.getByTestId('summary-money-out')).toHaveTextContent('50.00')
    expect(screen.getByTestId('summary-calculated-closing')).toHaveTextContent('1,100.00')
    expect(screen.getByTestId('summary-difference')).toHaveTextContent('0.00')
    expect(screen.getByTestId('summary-opening-difference')).toHaveTextContent('0.00')
    expect(screen.getByTestId('summary-unclassified-count')).toHaveTextContent('0')
  })
})
