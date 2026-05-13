import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WorkspaceCardSectionHeader } from './WorkspaceCardSectionHeader'

describe('WorkspaceCardSectionHeader', () => {
  it('renders the title', () => {
    render(<WorkspaceCardSectionHeader title="PO Items" />)
    expect(screen.getByText('PO Items')).toBeInTheDocument()
  })

  it('renders the action slot when provided', () => {
    render(<WorkspaceCardSectionHeader title="PO Items" action={<button>Action</button>} />)
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('renders no action slot when not provided', () => {
    render(<WorkspaceCardSectionHeader title="PO Items" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
