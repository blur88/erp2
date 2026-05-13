import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { LockStatusIcon } from './LockStatusIcon'

describe('LockStatusIcon', () => {
  it('renders a lock icon when locked', () => {
    render(<LockStatusIcon isLocked={true} tooltipText="unpay before editing" />)
    expect(screen.getByTestId('LockIcon')).toBeInTheDocument()
    expect(screen.queryByTestId('LockOpenIcon')).not.toBeInTheDocument()
  })

  it('renders an unlock icon when unlocked', () => {
    render(<LockStatusIcon isLocked={false} tooltipText="unlocked — editable" />)
    expect(screen.getByTestId('LockOpenIcon')).toBeInTheDocument()
    expect(screen.queryByTestId('LockIcon')).not.toBeInTheDocument()
  })

  it('shows tooltip text on hover when locked', async () => {
    render(<LockStatusIcon isLocked={true} tooltipText="unpay before editing" />)
    await userEvent.hover(screen.getByTestId('LockIcon'))
    expect(await screen.findByText('unpay before editing')).toBeInTheDocument()
  })

  it('shows tooltip text on hover when unlocked', async () => {
    render(<LockStatusIcon isLocked={false} tooltipText="unlocked — editable" />)
    await userEvent.hover(screen.getByTestId('LockOpenIcon'))
    expect(await screen.findByText('unlocked — editable')).toBeInTheDocument()
  })
})
