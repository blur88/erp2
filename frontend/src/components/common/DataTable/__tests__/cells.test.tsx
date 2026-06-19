import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { bold, viewAction, statusGroup } from '../cells'

describe('DataTable cells', () => {
  it('bold renders body2 text with fontWeight 600', () => {
    render(<>{bold('SO-001')}</>)
    const el = screen.getByText('SO-001')
    expect(el).toBeInTheDocument()
    expect(el).toHaveClass('MuiTypography-body2')
  })

  it('viewAction renders an enabled View button that calls onClick', async () => {
    const onClick = vi.fn()
    render(<>{viewAction(onClick)}</>)
    await userEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('viewAction renders a disabled button when disabled is true', () => {
    const onClick = vi.fn()
    render(<>{viewAction(onClick, true)}</>)
    expect(screen.getByRole('button', { name: /view/i })).toBeDisabled()
  })

  it('statusGroup renders all provided chips', () => {
    render(<>{statusGroup([<span key="a">A</span>, <span key="b">B</span>])}</>)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})
