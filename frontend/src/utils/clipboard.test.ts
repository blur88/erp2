import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyToClipboard } from './clipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses navigator.clipboard when available and returns true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const result = await copyToClipboard('hello')

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(result).toBe(true)
  })

  it('returns false when navigator.clipboard throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    // execCommand fallback also not available in jsdom — mock it to fail
    document.execCommand = vi.fn().mockReturnValue(false)

    const result = await copyToClipboard('hello')

    expect(result).toBe(false)
  })

  it('falls back to execCommand when navigator.clipboard is undefined and returns true on success', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    document.execCommand = vi.fn().mockReturnValue(true)

    const result = await copyToClipboard('hello world')

    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(result).toBe(true)
  })

  it('returns false when both clipboard API and execCommand fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    document.execCommand = vi.fn().mockReturnValue(false)

    const result = await copyToClipboard('hello')

    expect(result).toBe(false)
  })
})
