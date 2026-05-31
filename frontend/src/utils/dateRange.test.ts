// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getPeriodDateRange, getStartOfWeek, inferPeriodKey } from './dateRange'

const FIXED_NOW = new Date('2026-03-30T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getStartOfWeek', () => {
  it('returns 1 (Monday) when localStorage has no value', () => {
    expect(getStartOfWeek()).toBe(1)
  })

  it('returns 0 (Sunday) when localStorage has "0"', () => {
    localStorage.setItem('startOfWeek', '0')
    expect(getStartOfWeek()).toBe(0)
  })

  it('returns 1 (Monday) when localStorage has "1"', () => {
    localStorage.setItem('startOfWeek', '1')
    expect(getStartOfWeek()).toBe(1)
  })
})

describe('getPeriodDateRange', () => {
  it('today returns from=today and to=today', () => {
    const { from, to } = getPeriodDateRange('today')
    expect(from).toBe('2026-03-30')
    expect(to).toBe('2026-03-30')
  })

  it('yesterday returns from=yesterday and to=yesterday', () => {
    const { from, to } = getPeriodDateRange('yesterday')
    expect(from).toBe('2026-03-29')
    expect(to).toBe('2026-03-29')
  })

  it('last_7_days returns from=7 days ago and to=today', () => {
    const { from, to } = getPeriodDateRange('last_7_days')
    expect(from).toBe('2026-03-24')
    expect(to).toBe('2026-03-30')
  })

  it('last_30_days returns from=30 days ago and to=today', () => {
    const { from, to } = getPeriodDateRange('last_30_days')
    expect(from).toBe('2026-03-01')
    expect(to).toBe('2026-03-30')
  })

  it('last_365_days returns from=365 days ago and to=today', () => {
    const { from, to } = getPeriodDateRange('last_365_days')
    expect(from).toBe('2025-03-31')
    expect(to).toBe('2026-03-30')
  })

  it('this_month returns from=first of month and to=last of month', () => {
    const { from, to } = getPeriodDateRange('this_month')
    expect(from).toBe('2026-03-01')
    expect(to).toBe('2026-03-31')
  })

  it('last_month returns from=first of last month and to=last of last month', () => {
    const { from, to } = getPeriodDateRange('last_month')
    expect(from).toBe('2026-02-01')
    expect(to).toBe('2026-02-28')
  })

  it('this_year returns from=Jan 1 and to=Dec 31 of current year', () => {
    const { from, to } = getPeriodDateRange('this_year')
    expect(from).toBe('2026-01-01')
    expect(to).toBe('2026-12-31')
  })

  it('last_year returns from=Jan 1 and to=Dec 31 of previous year', () => {
    const { from, to } = getPeriodDateRange('last_year')
    expect(from).toBe('2025-01-01')
    expect(to).toBe('2025-12-31')
  })

  it('this_week with weekStartsOn=1 (Mon): 2026-03-30 is Monday so from=2026-03-30', () => {
    const { from, to } = getPeriodDateRange('this_week', 1)
    expect(from).toBe('2026-03-30')
    expect(to).toBe('2026-04-05')
  })

  it('this_week with weekStartsOn=0 (Sun): week started yesterday (2026-03-29)', () => {
    const { from, to } = getPeriodDateRange('this_week', 0)
    expect(from).toBe('2026-03-29')
    expect(to).toBe('2026-04-04')
  })

  it('last_week with weekStartsOn=1 (Mon): previous Mon-Sun', () => {
    const { from, to } = getPeriodDateRange('last_week', 1)
    expect(from).toBe('2026-03-23')
    expect(to).toBe('2026-03-29')
  })

  it('last_week with weekStartsOn=0 (Sun): previous Sun-Sat', () => {
    const { from, to } = getPeriodDateRange('last_week', 0)
    expect(from).toBe('2026-03-22')
    expect(to).toBe('2026-03-28')
  })
})

describe('inferPeriodKey', () => {
  it('infers today', () => {
    expect(inferPeriodKey('2026-03-30', '2026-03-30')).toBe('today')
  })

  it('infers yesterday', () => {
    expect(inferPeriodKey('2026-03-29', '2026-03-29')).toBe('yesterday')
  })

  it('infers this_month', () => {
    expect(inferPeriodKey('2026-03-01', '2026-03-31')).toBe('this_month')
  })

  it('infers last_month', () => {
    expect(inferPeriodKey('2026-02-01', '2026-02-28')).toBe('last_month')
  })

  it('infers this_year', () => {
    expect(inferPeriodKey('2026-01-01', '2026-12-31')).toBe('this_year')
  })

  it('infers last_year', () => {
    expect(inferPeriodKey('2025-01-01', '2025-12-31')).toBe('last_year')
  })

  it('infers last_7_days', () => {
    expect(inferPeriodKey('2026-03-24', '2026-03-30')).toBe('last_7_days')
  })

  it('infers last_30_days', () => {
    expect(inferPeriodKey('2026-03-01', '2026-03-30')).toBe('last_30_days')
  })

  it('infers this_week with weekStartsOn=1 (Mon)', () => {
    // 2026-03-30 is Monday → this week is Mon Mar 30 – Sun Apr 05
    expect(inferPeriodKey('2026-03-30', '2026-04-05', 1)).toBe('this_week')
  })

  it('infers this_week with weekStartsOn=0 (Sun)', () => {
    // week started Sun Mar 29 – Sat Apr 04
    expect(inferPeriodKey('2026-03-29', '2026-04-04', 0)).toBe('this_week')
  })

  it('infers last_week with weekStartsOn=1 (Mon)', () => {
    expect(inferPeriodKey('2026-03-23', '2026-03-29', 1)).toBe('last_week')
  })

  it('infers last_week with weekStartsOn=0 (Sun)', () => {
    expect(inferPeriodKey('2026-03-22', '2026-03-28', 0)).toBe('last_week')
  })

  it('falls back to custom for an arbitrary range', () => {
    expect(inferPeriodKey('2026-01-15', '2026-02-10')).toBe('custom')
  })
})
