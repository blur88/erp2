import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import KeyboardShortcutsModal from '../KeyboardShortcutsModal'

function renderModal(open = true) {
  const onClose = vi.fn()
  render(<KeyboardShortcutsModal open={open} onClose={onClose} />)
  return { onClose }
}

describe('KeyboardShortcutsModal', () => {
  it('renders the List Navigation group heading', () => {
    renderModal()
    expect(screen.getByText('List Navigation')).toBeInTheDocument()
  })

  it('renders the Global group heading', () => {
    renderModal()
    expect(screen.getByText('Global')).toBeInTheDocument()
  })

  it('renders all list navigation shortcut rows', () => {
    renderModal()
    expect(screen.getByText('Navigate between items')).toBeInTheDocument()
    expect(screen.getByText('Jump 20 items')).toBeInTheDocument()
    expect(screen.getByText('First / last item')).toBeInTheDocument()
    expect(screen.getByText('Edit selected item')).toBeInTheDocument()
    expect(screen.getByText('Clear selection or close dialog')).toBeInTheDocument()
  })

  it('renders all global shortcut rows', () => {
    renderModal()
    expect(screen.getByText('Open global search')).toBeInTheDocument()
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument()
  })

  it('renders the footer note', () => {
    renderModal()
    expect(screen.getByText(/list navigation shortcuts apply on list and table pages only/i)).toBeInTheDocument()
  })

  it('does not render when open is false', () => {
    renderModal(false)
    expect(screen.queryByText('List Navigation')).not.toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
