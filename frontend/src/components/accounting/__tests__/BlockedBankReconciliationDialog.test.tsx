import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import BlockedBankReconciliationDialog from '../BlockedBankReconciliationDialog'

function renderDialog(overrides: Partial<Parameters<typeof BlockedBankReconciliationDialog>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onReopenOnly: vi.fn(),
    onReopenAndDelete: vi.fn(),
    loading: false,
    ...overrides,
  }
  render(<BlockedBankReconciliationDialog {...props} />)
  return props
}

describe('BlockedBankReconciliationDialog', () => {
  it('renders the dialog title when open', () => {
    renderDialog()
    expect(screen.getByText('Reconciliation Already Completed')).toBeInTheDocument()
  })

  it('renders warning alert text', () => {
    renderDialog()
    expect(screen.getByText(/must be reopened before it can be deleted/i)).toBeInTheDocument()
  })

  it('renders Reopen Only and Reopen & Delete buttons', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: /reopen only/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reopen & delete/i })).toBeInTheDocument()
  })

  it('calls onReopenOnly when Reopen Only is clicked', () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /reopen only/i }))
    expect(props.onReopenOnly).toHaveBeenCalledTimes(1)
  })

  it('calls onReopenAndDelete when Reopen & Delete is clicked', () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /reopen & delete/i }))
    expect(props.onReopenAndDelete).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel is clicked', () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('disables buttons when loading', () => {
    renderDialog({ loading: true })
    expect(screen.getByRole('button', { name: /reopen only/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reopen & delete/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })

  it('does not render when closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByText('Reconciliation Already Completed')).not.toBeInTheDocument()
  })
})
