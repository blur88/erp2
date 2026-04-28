import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useJournalEntryRefs } from './useJournalEntryRefs'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockFetchJournalEntries = vi.fn()
vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: () => [mockFetchJournalEntries],
}))

function mockJournalEntriesResponse(data: Array<{ id: string; referenceNumber: string }>) {
  return {
    unwrap: () => Promise.resolve({ data }),
  }
}

describe('useJournalEntryRefs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no valid sources', async () => {
    const { result } = renderHook(() =>
      useJournalEntryRefs([{ sourceType: 'sales_order', sourceId: undefined }]),
    )

    expect(result.current.journalEntryRefs).toEqual([])
    expect(result.current.journalEntryRefsLoading).toBe(false)
  })

  it('collects refs from all sources', async () => {
    mockFetchJournalEntries
      .mockReturnValueOnce(mockJournalEntriesResponse([{ id: 'je-1', referenceNumber: 'JE-001' }]))
      .mockReturnValueOnce(mockJournalEntriesResponse([{ id: 'je-2', referenceNumber: 'JE-002' }]))

    const { result } = renderHook(() =>
      useJournalEntryRefs([
        { sourceType: 'sales_order', sourceId: 'so-1' },
        { sourceType: 'invoice', sourceId: 'inv-1' },
      ]),
    )

    await waitFor(() => expect(result.current.journalEntryRefsLoading).toBe(false))
    expect(result.current.journalEntryRefs).toHaveLength(2)
    expect(result.current.journalEntryRefs[0].referenceNumber).toBe('JE-001')
    expect(result.current.journalEntryRefs[1].referenceNumber).toBe('JE-002')
  })

  it('navigates with sourceType/sourceId when exactly one ref', async () => {
    mockFetchJournalEntries.mockReturnValueOnce(
      mockJournalEntriesResponse([{ id: 'je-1', referenceNumber: 'JE-001' }]),
    )

    const { result } = renderHook(() =>
      useJournalEntryRefs([{ sourceType: 'sales_order', sourceId: 'so-1' }]),
    )

    await waitFor(() => expect(result.current.journalEntryRefsLoading).toBe(false))
    result.current.navigateToJournalEntries()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/accounting/journal-entries?sourceType=sales_order&sourceId=so-1',
    )
  })

  it('navigates with ids param when multiple refs', async () => {
    mockFetchJournalEntries
      .mockReturnValueOnce(mockJournalEntriesResponse([{ id: 'je-1', referenceNumber: 'JE-001' }]))
      .mockReturnValueOnce(mockJournalEntriesResponse([{ id: 'je-2', referenceNumber: 'JE-002' }]))

    const { result } = renderHook(() =>
      useJournalEntryRefs([
        { sourceType: 'sales_order', sourceId: 'so-1' },
        { sourceType: 'invoice', sourceId: 'inv-1' },
      ]),
    )

    await waitFor(() => expect(result.current.journalEntryRefsLoading).toBe(false))
    result.current.navigateToJournalEntries()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/accounting/journal-entries?ids=je-1,je-2',
    )
  })

  it('does not navigate when no refs', async () => {
    mockFetchJournalEntries.mockReturnValueOnce(mockJournalEntriesResponse([]))

    const { result } = renderHook(() =>
      useJournalEntryRefs([{ sourceType: 'sales_order', sourceId: 'so-1' }]),
    )

    await waitFor(() => expect(result.current.journalEntryRefsLoading).toBe(false))
    result.current.navigateToJournalEntries()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
