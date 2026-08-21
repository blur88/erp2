import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BusinessPerformanceChart from '../BusinessPerformanceChart'

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }))

vi.mock('react-chartjs-2', () => ({
    Line: (props: { data: unknown }) => {
        chartSpy(props)
        return <div data-testid="chart" />
    },
}))

// rawData must be non-null: with it null the memo returns early and the guard
// under test is unreachable.
const chartProps = {
    rawData: {
        salesOrders: [],
        purchaseOrders: [],
        payments: [],
        inventoryValue: 0,
    },
}

const renderChart = () =>
    render(
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <BusinessPerformanceChart {...chartProps} />
        </LocalizationProvider>,
    )

// Select "Custom Date Range" so the two pickers mount (they render only when
// chartFilters.dateFilter === 'custom').
const openCustomRange = async () => {
    await userEvent.click(screen.getByRole('combobox', { name: /date filter/i }))
    await userEvent.click(await screen.findByRole('option', { name: /custom date range/i }))
}

describe('BusinessPerformanceChart custom range', () => {
    beforeEach(() => {
        localStorage.setItem('dateFormat', 'DD/MM/YYYY')
    })

    it('keeps the committed range when an impossible day/month pair is typed', async () => {
        renderChart()
        await openCustomRange()
        const field = screen.getByRole('group', { name: /from date/i })
        const before = field.textContent
        // 31 February emits Invalid Date; treating it as a clear would blank
        // the range and (before the interval guard) crash the chart.
        await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
        await userEvent.keyboard('31')
        await userEvent.click(within(field).getByRole('spinbutton', { name: /month/i }))
        await userEvent.keyboard('02')

        expect(screen.getByRole('group', { name: /from date/i }).textContent).not.toBe('')
        expect(before).not.toBe('')
    })

    it('renders both custom bounds as pickers', async () => {
        renderChart()
        await openCustomRange()
        expect(screen.getByRole('group', { name: /from date/i })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: /to date/i })).toBeInTheDocument()
    })

    it('does not throw when a custom bound is cleared', async () => {
        renderChart()
        await openCustomRange()
        const field = screen.getByRole('group', { name: /from date/i })
        // Before the guard this throws RangeError: Invalid time value out of
        // eachDayOfInterval and takes the whole chart down.
        await userEvent.click(within(field).getByRole('button', { name: /clear/i }))
        expect(screen.getByRole('group', { name: /to date/i })).toBeInTheDocument()
    })

    it('produces no interval data until both bounds are valid', async () => {
        renderChart()
        await openCustomRange()
        const field = screen.getByRole('group', { name: /from date/i })
        await userEvent.click(within(field).getByRole('button', { name: /clear/i }))
        // chartData falls back to the empty shape rather than a partial interval.
        await waitFor(() => {
            expect(chartSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({ data: { labels: [], datasets: [] } }),
            )
        })
    })
})
