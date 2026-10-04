import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ReconciliationLineDto, SetupSummaryDto } from '@/types'
import SetupClassificationSection from '../SetupClassificationSection'

function makeLine(over: Partial<ReconciliationLineDto> = {}): ReconciliationLineDto {
  return {
    journalEntryLineId: 'jel-1',
    journalEntryId: 'je-1',
    entryDate: '2025-12-15',
    journalNo: 'JE-001',
    sourceType: 'EXPENSE',
    sourceDocumentId: null,
    sourceRef: null,
    description: 'Pre-period entry',
    moneyIn: '100.00',
    moneyOut: '0.00',
    role: 'OUTSTANDING',
    prePeriod: true,
    classification: 'UNCLASSIFIED',
    ...over,
  }
}

describe('SetupClassificationSection', () => {
  const defaultSummary: SetupSummaryDto = {
    prePeriodTotal: 5,
    unclassifiedCount: 3,
    clearedCount: 1,
    outstandingCount: 1,
    openingClearedNet: '100.00',
    openingBalanceDifference: '25.00',
  }

  it('shows neither choice pressed for an Unclassified row', () => {
    const line = makeLine()
    render(
      <MemoryRouter>
        <SetupClassificationSection
          rows={[line]}
          total={1}
          page={1}
          search=""
          filter="ALL"
          loading={false}
          summary={defaultSummary}
          classificationOf={() => 'UNCLASSIFIED'}
          onClassify={vi.fn()}
          onClear={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    const alreadyClearedBtn = screen.getByRole('button', { name: 'Already cleared' })
    const outstandingBtn = screen.getByRole('button', { name: 'Outstanding' })

    expect(alreadyClearedBtn).toHaveAttribute('aria-pressed', 'false')
    expect(outstandingBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('pressing the active choice calls onClear', async () => {
    const line = makeLine()
    const onClear = vi.fn()
    const onClassify = vi.fn()

    render(
      <MemoryRouter>
        <SetupClassificationSection
          rows={[line]}
          total={1}
          page={1}
          search=""
          filter="ALL"
          loading={false}
          summary={defaultSummary}
          classificationOf={() => 'CLEARED'}
          onClassify={onClassify}
          onClear={onClear}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    const alreadyClearedBtn = screen.getByRole('button', { name: 'Already cleared' })
    expect(alreadyClearedBtn).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(alreadyClearedBtn)
    expect(onClear).toHaveBeenCalledWith(line)
  })

  it('Clear classification is disabled for an Unclassified row and enabled otherwise', () => {
    const lineUnclassified = makeLine({ journalEntryLineId: 'u1' })
    const lineCleared = makeLine({ journalEntryLineId: 'c1' })

    const { unmount } = render(
      <MemoryRouter>
        <SetupClassificationSection
          rows={[lineUnclassified]}
          total={1}
          page={1}
          search=""
          filter="ALL"
          loading={false}
          summary={defaultSummary}
          classificationOf={() => 'UNCLASSIFIED'}
          onClassify={vi.fn()}
          onClear={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    const clearBtn1 = screen.getByRole('button', { name: 'Clear' })
    expect(clearBtn1).toBeDisabled()
    unmount()

    render(
      <MemoryRouter>
        <SetupClassificationSection
          rows={[lineCleared]}
          total={1}
          page={1}
          search=""
          filter="ALL"
          loading={false}
          summary={defaultSummary}
          classificationOf={() => 'CLEARED'}
          onClassify={vi.fn()}
          onClear={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    const clearBtn2 = screen.getByRole('button', { name: 'Clear' })
    expect(clearBtn2).not.toBeDisabled()
  })

  it('shows "<n> unclassified" and the Opening Balance Difference', () => {
    render(
      <MemoryRouter>
        <SetupClassificationSection
          rows={[]}
          total={0}
          page={1}
          search=""
          filter="ALL"
          loading={false}
          summary={defaultSummary}
          classificationOf={() => 'UNCLASSIFIED'}
          onClassify={vi.fn()}
          onClear={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText(/3 unclassified/i)).toBeInTheDocument()
    expect(screen.getByText(/25\.00/)).toBeInTheDocument()
  })

  it('offers exactly the four filters and no bulk action', () => {
    render(
      <MemoryRouter>
        <SetupClassificationSection
          rows={[]}
          total={0}
          page={1}
          search=""
          filter="ALL"
          loading={false}
          summary={defaultSummary}
          classificationOf={() => 'UNCLASSIFIED'}
          onClassify={vi.fn()}
          onClear={vi.fn()}
          onPageChange={vi.fn()}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Unclassified' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Already cleared' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Outstanding' })).toBeInTheDocument()

    // No bulk actions present
    expect(screen.queryByRole('button', { name: /bulk/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /classify all/i })).not.toBeInTheDocument()
  })
})
