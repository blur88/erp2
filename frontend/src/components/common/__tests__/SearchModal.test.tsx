import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SearchModal from '../SearchModal'

describe('SearchModal', () => {
  it('renders nothing when closed', () => {
    render(<SearchModal open={false} onClose={vi.fn()} />)

    expect(screen.queryByPlaceholderText('Search across the ERP...')).not.toBeInTheDocument()
  })

  it('renders search input and coming soon content when open', () => {
    render(<SearchModal open={true} onClose={vi.fn()} />)

    expect(screen.getByPlaceholderText('Search across the ERP...')).toBeInTheDocument()
    expect(screen.getByText('Global Search Coming Soon')).toBeInTheDocument()
    expect(screen.getByText(/Ctrl\+K/i)).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()

    render(<SearchModal open={true} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })
})
