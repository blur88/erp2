import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusChip } from '@/components/common/StatusChip'

// The dashboard renders <StatusChip status={isOpen ? 'open' : 'closed'} />.
// Guard the intended color change: Closed is grey (default), not error.
describe('Fiscal period chip color (dashboard)', () => {
  const chipRoot = () => document.querySelector('.MuiChip-root') as HTMLElement

  it('Open → success', () => {
    render(<StatusChip status="open" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorSuccess')
  })

  it('Closed → default (grey), NOT error', () => {
    render(<StatusChip status="closed" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorDefault')
    expect(chipRoot()).not.toHaveClass('MuiChip-colorError')
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })
})
