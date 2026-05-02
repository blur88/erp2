// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('printReport', () => {
  let mockDoc: {
    write: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  let mockPrintWindow: {
    document: typeof mockDoc
    onload: (() => void) | null
    print: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.restoreAllMocks()

    mockDoc = {
      write: vi.fn(),
      close: vi.fn(),
    }
    mockPrintWindow = {
      document: mockDoc,
      onload: null,
      print: vi.fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow as unknown as Window)
  })

  it('opens a new blank window', async () => {
    const { printReport } = await import('../printReport')
    printReport('<html><body>hello</body></html>', 'Test')
    expect(window.open).toHaveBeenCalledWith('', '_blank')
  })

  it('writes sanitized html to the new window document', async () => {
    const { printReport } = await import('../printReport')
    const maliciousHtml = '<html><body><p>hello</p><script>alert(1)</script></body></html>'
    printReport(maliciousHtml, 'Test')
    const written = mockDoc.write.mock.calls[0][0] as string
    expect(written).not.toContain('<script>')
    expect(written).not.toContain('alert(1)')
    expect(written).toContain('hello')
  })

  it('calls doc.close() after writing', async () => {
    const { printReport } = await import('../printReport')
    printReport('<html><body>x</body></html>', 'Test')
    expect(mockDoc.close).toHaveBeenCalled()
  })

  it('sets window.onload to trigger print', async () => {
    const { printReport } = await import('../printReport')
    printReport('<html><body>x</body></html>', 'Test')
    expect(mockPrintWindow.onload).toBeTypeOf('function')
  })

  it('returns early without throwing when window.open is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { printReport } = await import('../printReport')
    expect(() => printReport('<html><body>x</body></html>', 'Test')).not.toThrow()
  })

  it('preserves style tags', async () => {
    const { printReport } = await import('../printReport')
    const htmlWithStyle = '<html><head><style>body { margin: 0; }</style></head><body>x</body></html>'
    printReport(htmlWithStyle, 'Test')
    const written = mockDoc.write.mock.calls[0][0] as string
    expect(written).toContain('<style>')
    expect(written).toContain('margin: 0')
  })
})
