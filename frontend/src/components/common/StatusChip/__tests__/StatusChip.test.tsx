import { describe, expect, it } from 'vitest'

import { resolveStatusColor, STATUS_MAP } from '../statusColors'

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
