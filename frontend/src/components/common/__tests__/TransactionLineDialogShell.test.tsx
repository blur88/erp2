import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TransactionLineDialogShell, { DialogLineRow } from '../TransactionLineDialogShell'

function renderShell(props: Partial<ComponentProps<typeof TransactionLineDialogShell>> = {}) {
  const defaults = {
    open: true,
    title: 'Record Payment — SO-26-001',
    onRequestClose: vi.fn(),
    summary: <div>SUMMARY_SLOT</div>,
    children: <div>LINES_SLOT</div>,
    totals: <div>TOTALS_SLOT</div>,
    alerts: <div>ALERTS_SLOT</div>,
    actions: <button type="button">Cancel</button>,
    discardOpen: false,
    discardTitle: 'Discard this payment?',
    onKeepEditing: vi.fn(),
    onDiscard: vi.fn(),
  }
  return render(<TransactionLineDialogShell {...defaults} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransactionLineDialogShell structure', () => {
  it('renders at maxWidth md and fullWidth', () => {
    const { container } = renderShell()
    expect(container.ownerDocument.querySelector('.MuiDialog-paperWidthMd')).toBeTruthy()
    expect(container.ownerDocument.querySelector('.MuiDialog-paperFullWidth')).toBeTruthy()
  })

  it('labels the dialog by its rendered title element', () => {
    renderShell()
    const dialog = screen.getByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const titleEl = dialog.ownerDocument.getElementById(labelledBy as string)
    expect(titleEl).toHaveTextContent('Record Payment — SO-26-001')
  })

  it('renders every content slot when not loading', () => {
    renderShell()
    expect(screen.getByText('SUMMARY_SLOT')).toBeInTheDocument()
    expect(screen.getByText('LINES_SLOT')).toBeInTheDocument()
    expect(screen.getByText('TOTALS_SLOT')).toBeInTheDocument()
    expect(screen.getByText('ALERTS_SLOT')).toBeInTheDocument()
  })
})

describe('TransactionLineDialogShell loading', () => {
  it('replaces the entire content region with a spinner', () => {
    renderShell({ loading: true })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('SUMMARY_SLOT')).not.toBeInTheDocument()
    expect(screen.queryByText('LINES_SLOT')).not.toBeInTheDocument()
    expect(screen.queryByText('TOTALS_SLOT')).not.toBeInTheDocument()
    expect(screen.queryByText('ALERTS_SLOT')).not.toBeInTheDocument()
  })

  it('still renders actions while loading so Cancel stays reachable', () => {
    renderShell({ loading: true })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})

describe('TransactionLineDialogShell discard confirmation', () => {
  it('shows the discard title when discardOpen is true', () => {
    renderShell({ discardOpen: true })
    expect(screen.getByText('Discard this payment?')).toBeInTheDocument()
  })

  it('fires onKeepEditing from Keep Editing', async () => {
    const onKeepEditing = vi.fn()
    const onDiscard = vi.fn()
    renderShell({ discardOpen: true, onKeepEditing, onDiscard })
    await userEvent.click(screen.getByRole('button', { name: 'Keep Editing' }))
    expect(onKeepEditing).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('fires onDiscard from Discard', async () => {
    const onKeepEditing = vi.fn()
    const onDiscard = vi.fn()
    renderShell({ discardOpen: true, onKeepEditing, onDiscard })
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onKeepEditing).not.toHaveBeenCalled()
  })
})

describe('DialogLineRow', () => {
  // jsdom has no layout engine: these assert the CSS configuration that produces
  // wrapping, NOT that wrapping actually happens. Real layout is browser-verified.
  it('sets flexWrap wrap on the row', () => {
    const { container } = render(
      <DialogLineRow trailing={<span>TRAILING</span>}>
        <span>FIELD</span>
      </DialogLineRow>,
    )
    const row = container.firstElementChild as HTMLElement
    expect(row).toHaveStyle({ display: 'flex', flexWrap: 'wrap' })
  })

  it('groups trailing content into a single flex child with a 248px minimum', () => {
    const { container } = render(
      <DialogLineRow trailing={<span>TRAILING</span>}>
        <span>FIELD</span>
      </DialogLineRow>,
    )
    const row = container.firstElementChild as HTMLElement
    const trailingGroup = row.lastElementChild as HTMLElement
    expect(trailingGroup).toHaveTextContent('TRAILING')
    expect(trailingGroup).toHaveStyle({ minWidth: '248px' })
  })
})