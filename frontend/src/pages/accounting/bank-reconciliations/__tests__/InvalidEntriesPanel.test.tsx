import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReconciliationLineDto } from '@/types'
import InvalidEntriesPanel from '../InvalidEntriesPanel'

function makeLine(over: Partial<ReconciliationLineDto> = {}): ReconciliationLineDto {
  return {
    journalEntryLineId: 'jel-1',
    journalEntryId: 'je-1',
    entryDate: '2026-02-15',
    journalNo: 'JE-999',
    sourceType: 'EXPENSE',
    sourceDocumentId: null,
    sourceRef: null,
    description: 'Future line',
    moneyIn: '50.00',
    moneyOut: '0.00',
    role: 'OUTSTANDING',
    prePeriod: false,
    classification: null,
    ...over,
  }
}

describe('InvalidEntriesPanel', () => {
  it('renders nothing when both lists are empty', () => {
    const { container } = render(
      <InvalidEntriesPanel
        invalidMatched={[]}
        invalidClassifications={[]}
        onUntick={vi.fn()}
        onClearClassification={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists invalid matched entries each with an Untick control', async () => {
    const line = makeLine({ journalEntryLineId: 'inv-1', journalNo: 'JE-INV-1' })
    const onUntick = vi.fn()

    render(
      <InvalidEntriesPanel
        invalidMatched={[line]}
        invalidClassifications={[]}
        onUntick={onUntick}
        onClearClassification={vi.fn()}
      />,
    )

    expect(screen.getByText(/JE-INV-1/)).toBeInTheDocument()
    const untickBtn = screen.getByRole('button', { name: 'Untick' })
    expect(untickBtn).toBeInTheDocument()

    await userEvent.click(untickBtn)
    expect(onUntick).toHaveBeenCalledWith('inv-1')
  })

  it('lists invalid classifications each with a Clear classification control', async () => {
    const line = makeLine({ journalEntryLineId: 'inv-c1', journalNo: 'JE-INV-C1' })
    const onClear = vi.fn()

    render(
      <InvalidEntriesPanel
        invalidMatched={[]}
        invalidClassifications={[line]}
        onUntick={vi.fn()}
        onClearClassification={onClear}
      />,
    )

    expect(screen.getByText(/JE-INV-C1/)).toBeInTheDocument()
    const clearBtn = screen.getByRole('button', { name: 'Clear classification' })
    expect(clearBtn).toBeInTheDocument()

    await userEvent.click(clearBtn)
    expect(onClear).toHaveBeenCalledWith(line)
  })
})
