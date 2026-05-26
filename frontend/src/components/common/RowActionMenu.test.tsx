import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import RowActionMenu, { type RowAction } from './RowActionMenu'

const actions = [
  { label: 'Edit', onClick: vi.fn() },
  { label: 'Set as Inactive', onClick: vi.fn() },
]

describe('RowActionMenu', () => {
  it('renders the trigger button', () => {
    render(<RowActionMenu actions={actions} />)
    expect(screen.getByRole('button', { name: /row actions/i })).toBeInTheDocument()
  })

  it('opens the menu when trigger is clicked', () => {
    render(<RowActionMenu actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: /row actions/i }))
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Set as Inactive')).toBeInTheDocument()
  })

  it('calls the action onClick and closes the menu', () => {
    const onEdit = vi.fn()
    render(<RowActionMenu actions={[{ label: 'Edit', onClick: onEdit }]} />)
    fireEvent.click(screen.getByRole('button', { name: /row actions/i }))
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('renders disabled actions as non-interactive', () => {
    render(
      <RowActionMenu
        actions={[{ label: 'Disabled Action', onClick: vi.fn(), disabled: true }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /row actions/i }))
    const item = screen.getByText('Disabled Action').closest('li')
    expect(item).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows tooltip on a disabled action', async () => {
    const actions: RowAction[] = [
      {
        label: 'Fulfill',
        onClick: vi.fn(),
        disabled: true,
        tooltip: 'Full payment required',
      },
    ]
    render(<RowActionMenu actions={actions} />)
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    const item = screen.getByRole('menuitem', { name: /fulfill/i })
    expect(item).toBeInTheDocument()
    // Tooltip wraps the item — its title is on the wrapper span
    expect(item.closest('[title]') ?? screen.getByTitle('Full payment required')).toBeInTheDocument()
  })
})
