import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useDocumentNumberPreview } from './useDocumentNumberPreview'

const { mockGetDocumentNumberSettings } = vi.hoisted(() => ({
  mockGetDocumentNumberSettings: vi.fn(),
}))

vi.mock('@/store/api/settingsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/settingsApi')>()
  return {
    ...actual,
    useGetDocumentNumberSettingsQuery: (arg: unknown, opts?: { skip?: boolean }) =>
      mockGetDocumentNumberSettings(arg, opts),
  }
})

const yy = String(new Date().getFullYear() % 100).padStart(2, '0')

const settings = (configurations: unknown[]) => ({
  data: { configurations },
  isLoading: false,
})

describe('useDocumentNumberPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDocumentNumberSettings.mockReturnValue(
      settings([
        { documentName: 'Expenses', prefix: 'EXP', nextNumber: 1, paddingDigits: 3, lastResetYear: 26 },
      ]),
    )
  })

  it('formats prefix, two-digit year and padded next number', () => {
    const { result } = renderHook(() => useDocumentNumberPreview('Expenses'))
    expect(result.current).toBe(`EXP-${yy}-001`)
  })

  it('honors a custom prefix and padding width', () => {
    mockGetDocumentNumberSettings.mockReturnValue(
      settings([
        { documentName: 'Expenses', prefix: 'COST', nextNumber: 42, paddingDigits: 5, lastResetYear: 26 },
      ]),
    )
    const { result } = renderHook(() => useDocumentNumberPreview('Expenses'))
    expect(result.current).toBe(`COST-${yy}-00042`)
  })

  it('selects the configuration matching the requested documentName', () => {
    mockGetDocumentNumberSettings.mockReturnValue(
      settings([
        { documentName: 'Sales Orders', prefix: 'SO', nextNumber: 7, paddingDigits: 3, lastResetYear: 26 },
        { documentName: 'Expenses', prefix: 'EXP', nextNumber: 9, paddingDigits: 3, lastResetYear: 26 },
      ]),
    )
    const { result } = renderHook(() => useDocumentNumberPreview('Expenses'))
    expect(result.current).toBe(`EXP-${yy}-009`)
  })

  it('returns Loading... while settings are loading', () => {
    mockGetDocumentNumberSettings.mockReturnValue({ data: undefined, isLoading: true })
    const { result } = renderHook(() => useDocumentNumberPreview('Expenses'))
    expect(result.current).toBe('Loading...')
  })

  it('falls back to Auto-generated when no matching configuration exists', () => {
    mockGetDocumentNumberSettings.mockReturnValue(settings([]))
    const { result } = renderHook(() => useDocumentNumberPreview('Expenses'))
    expect(result.current).toBe('Auto-generated')
  })

  it('returns null when disabled, before any loading or config branch', () => {
    mockGetDocumentNumberSettings.mockReturnValue({ data: undefined, isLoading: false })
    const { result } = renderHook(() => useDocumentNumberPreview('Expenses', false))
    expect(result.current).toBeNull()
  })

  it('skips the settings request when disabled', () => {
    renderHook(() => useDocumentNumberPreview('Expenses', false))
    expect(mockGetDocumentNumberSettings).toHaveBeenCalledWith(undefined, { skip: true })
  })
})
