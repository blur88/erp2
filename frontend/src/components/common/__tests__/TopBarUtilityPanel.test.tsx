import type React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import TopBarUtilityPanel from '../TopBarUtilityPanel'

function renderPanel(props: Partial<React.ComponentProps<typeof TopBarUtilityPanel>> = {}) {
  const anchorEl = document.createElement('button')
  document.body.appendChild(anchorEl)
  const onClose = vi.fn()
  render(
    <TopBarUtilityPanel anchorEl={anchorEl} onClose={onClose} title="Test Panel" {...props}>
      <div data-testid="panel-content">Content</div>
    </TopBarUtilityPanel>
  )
  return { onClose, anchorEl }
}

describe('TopBarUtilityPanel', () => {
  it('renders the title', () => {
    renderPanel()
    expect(screen.getByText('Test Panel')).toBeInTheDocument()
  })

  it('renders children', () => {
    renderPanel()
    expect(screen.getByTestId('panel-content')).toBeInTheDocument()
  })

  it('renders a headerAction when provided', () => {
    renderPanel({ headerAction: <button data-testid="header-action">Action</button> })
    expect(screen.getByTestId('header-action')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const { onClose } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render when anchorEl is null', () => {
    const onClose = vi.fn()
    render(
      <TopBarUtilityPanel anchorEl={null} onClose={onClose} title="Hidden Panel">
        <div data-testid="hidden-content">Content</div>
      </TopBarUtilityPanel>
    )
    expect(screen.queryByText('Hidden Panel')).not.toBeInTheDocument()
  })
})
