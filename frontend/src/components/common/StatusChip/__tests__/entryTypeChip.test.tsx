import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EntityTypeChip } from '../entryTypeChip'

describe('EntityTypeChip', () => {
  const chipRoot = () => document.querySelector('.MuiChip-root') as HTMLElement

  it('renders Manual as primary', () => {
    render(<EntityTypeChip type="manual" />)
    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorPrimary')
  })

  it('renders System as secondary', () => {
    render(<EntityTypeChip type="system" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorSecondary')
  })

  it('is case-insensitive', () => {
    render(<EntityTypeChip type="ADJUSTMENT" />)
    expect(screen.getByText('Adjustment')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorWarning')
  })

  it('falls back to default + raw label for unknown type', () => {
    render(<EntityTypeChip type="weird" />)
    expect(screen.getByText('Weird')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorDefault')
  })

  it('defaults to outlined variant', () => {
    render(<EntityTypeChip type="manual" />)
    expect(chipRoot()).toHaveClass('MuiChip-outlined')
  })
})
