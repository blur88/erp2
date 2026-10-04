import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ReconciliationLineDto } from '@/types'
import ReconciliationLinePicker from '../ReconciliationLinePicker'

function makeLine(over: Partial<ReconciliationLineDto> = {}): ReconciliationLineDto {
  return {
    journalEntryLineId: 'jel-1',
    journalEntryId: 'je-1',
    entryDate: '2026-01-15',
    journalNo: 'JE-001',
    sourceType: 'EXPENSE',
    sourceDocumentId: 'doc-1',
    sourceRef: 'EXP-001',
    description: 'Office supplies',
    moneyIn: '0.00',
    moneyOut: '50.00',
    role: 'OUTSTANDING',
    prePeriod: false,
    classification: null,
    ...over,
  }
}

describe('ReconciliationLinePicker', () => {
  it('renders the seven columns in order', () => {
    const line = makeLine()
    render(
      <MemoryRouter>
        <ReconciliationLinePicker
          rows={[line]}
          total={1}
          page={1}
          search=""
          loading={false}
          selectedIds={new Set()}
          onToggle={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
    expect(headers).toEqual(['', 'Date', 'Journal No', 'Source', 'Description', 'Money In', 'Money Out'])
  })

  it('search clear control is labelled "Clear search" and resets the search', async () => {
    const onSearchChange = vi.fn()
    render(
      <MemoryRouter>
        <ReconciliationLinePicker
          rows={[]}
          total={0}
          page={1}
          search="test search"
          loading={false}
          selectedIds={new Set()}
          onToggle={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={onSearchChange}
        />
      </MemoryRouter>,
    )

    const clearBtn = screen.getByRole('button', { name: 'Clear search' })
    expect(clearBtn).toBeInTheDocument()
    await userEvent.click(clearBtn)
    expect(onSearchChange).toHaveBeenCalledWith('')
  })

  it('checks rows whose id is in selectedIds even when the row came from another page', () => {
    const line = makeLine({ journalEntryLineId: 'jel-selected' })
    render(
      <MemoryRouter>
        <ReconciliationLinePicker
          rows={[line]}
          total={1}
          page={1}
          search=""
          loading={false}
          selectedIds={new Set(['jel-selected', 'jel-other-page'])}
          onToggle={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
  })

  it('names each checkbox after its transaction', () => {
    const original = makeLine({ journalEntryLineId: 'jel-a', journalNo: 'JE-100', moneyIn: '200.00', moneyOut: '0.00' })
    const reversal = makeLine({ journalEntryLineId: 'jel-b', journalNo: 'JE-101', moneyIn: '0.00', moneyOut: '200.00' })
    render(
      <MemoryRouter>
        <ReconciliationLinePicker
          rows={[original, reversal]}
          total={2}
          page={1}
          search=""
          loading={false}
          selectedIds={new Set(['jel-b'])}
          onToggle={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    // An original and its reversal share a date and an amount; the name tells them apart.
    const first = screen.getByRole('checkbox', { name: /^Select JE-100, .*Money In 200\.00, Money Out 0\.00$/ })
    const second = screen.getByRole('checkbox', { name: /^Select JE-101, .*Money In 0\.00, Money Out 200\.00$/ })
    expect(first).not.toBeChecked()
    expect(second).toBeChecked()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('renders an opening-balance source as plain text, not a link', () => {
    const line = makeLine({
      sourceType: 'OPENING_BALANCE',
      sourceDocumentId: null,
      sourceRef: null,
    })
    render(
      <MemoryRouter>
        <ReconciliationLinePicker
          rows={[line]}
          total={1}
          page={1}
          search=""
          loading={false}
          selectedIds={new Set()}
          onToggle={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('Opening Balance')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Opening Balance' })).not.toBeInTheDocument()
  })
})
