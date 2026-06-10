import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { resolveStatusColor, STATUS_MAP } from '../statusColors'
import { StatusChip } from '../StatusChip'

describe('resolveStatusColor', () => {
  it('resolves known statuses to canonical colors', () => {
    expect(resolveStatusColor('paid')).toBe('success')
    expect(resolveStatusColor('unpaid')).toBe('error')
    expect(resolveStatusColor('partial')).toBe('warning')
    expect(resolveStatusColor('open')).toBe('success')
  })

  it('is case-insensitive', () => {
    expect(resolveStatusColor('PAID')).toBe('success')
    expect(resolveStatusColor('Cancelled')).toBe('default')
  })

  it('resolves conflict-decided statuses to default (grey)', () => {
    expect(resolveStatusColor('cancelled')).toBe('default')
    expect(resolveStatusColor('inactive')).toBe('default')
    expect(resolveStatusColor('closed')).toBe('default')
  })

  it('returns default for unknown / null / empty', () => {
    expect(resolveStatusColor('totally_unknown')).toBe('default')
    expect(resolveStatusColor(null)).toBe('default')
    expect(resolveStatusColor(undefined)).toBe('default')
    expect(resolveStatusColor('')).toBe('default')
  })

  it('STATUS_MAP keys are all lowercase', () => {
    Object.keys(STATUS_MAP).forEach((k) => expect(k).toBe(k.toLowerCase()))
  })
})

describe('StatusChip', () => {
  const chipRoot = () => document.querySelector('.MuiChip-root') as HTMLElement

  it('renders canonical label and color for a known status', () => {
    render(<StatusChip status="PAID" />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorSuccess')
  })

  it('is case-insensitive (lowercase + uppercase resolve same)', () => {
    render(<StatusChip status="cancelled" />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorDefault')
  })

  it('title-cases an unknown status and uses default color', () => {
    render(<StatusChip status="some_weird_state" />)
    expect(screen.getByText('Some Weird State')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorDefault')
  })

  it('renders Unknown for null/empty status', () => {
    render(<StatusChip status={null} />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('label override wins over canonical label, color still canonical', () => {
    render(<StatusChip status="out_of_stock" label="Out" />)
    expect(screen.getByText('Out')).toBeInTheDocument()
    expect(screen.queryByText('Out of Stock')).not.toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorError')
  })

  it('passes through variant and icon', () => {
    render(<StatusChip status="paid" variant="outlined" />)
    expect(chipRoot()).toHaveClass('MuiChip-outlined')
  })

  it('merges an sx array without crashing (array-form regression guard)', () => {
    render(<StatusChip status="paid" sx={[{ height: 20 }, { fontWeight: 500 }]} />)
    expect(chipRoot()).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('merges an sx object', () => {
    render(<StatusChip status="paid" sx={{ height: 20 }} />)
    expect(chipRoot()).toBeInTheDocument()
  })
})
