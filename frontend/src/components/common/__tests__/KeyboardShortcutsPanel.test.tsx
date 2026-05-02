import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import KeyboardShortcutsPanel from '../KeyboardShortcutsPanel'

function renderPanel(anchorEl: HTMLElement | null = null) {
  const onClose = vi.fn()
  render(<KeyboardShortcutsPanel anchorEl={anchorEl} onClose={onClose} />)
  return { onClose }
}

function renderOpen() {
  const anchorEl = document.createElement('button')
  document.body.appendChild(anchorEl)
  return renderPanel(anchorEl)
}

describe('KeyboardShortcutsPanel', () => {
  it('renders the List Navigation group heading when open', () => {
    renderOpen()
    expect(screen.getByText('List Navigation')).toBeInTheDocument()
  })

  it('renders the Global group heading when open', () => {
    renderOpen()
    expect(screen.getByText('Global')).toBeInTheDocument()
  })

  it('renders all list navigation shortcut rows', () => {
    renderOpen()
    expect(screen.getByText('Navigate between items')).toBeInTheDocument()
    expect(screen.getByText('Jump 20 items')).toBeInTheDocument()
    expect(screen.getByText('First / last item')).toBeInTheDocument()
    expect(screen.getByText('Edit selected item')).toBeInTheDocument()
    expect(screen.getByText('Clear selection or close dialog')).toBeInTheDocument()
  })

  it('renders all global shortcut rows', () => {
    renderOpen()
    expect(screen.getByText('Open global search')).toBeInTheDocument()
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument()
  })

  it('renders the footer note', () => {
    renderOpen()
    expect(screen.getByText(/list navigation shortcuts apply on list and table pages only/i)).toBeInTheDocument()
  })

  it('does not render content when anchorEl is null', () => {
    renderPanel(null)
    expect(screen.queryByText('List Navigation')).not.toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const { onClose } = renderOpen()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
