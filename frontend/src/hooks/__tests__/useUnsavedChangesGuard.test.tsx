import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockProceed = vi.fn()
const mockReset = vi.fn()
let mockBlockerState: 'idle' | 'blocked' = 'idle'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')

  return {
    ...actual,
    useBlocker: (shouldBlock: () => boolean) => {
      if (shouldBlock()) {
        return { state: mockBlockerState, proceed: mockProceed, reset: mockReset }
      }

      return { state: 'idle', proceed: mockProceed, reset: mockReset }
    },
  }
})

import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard'

const TestConsumer = ({ isDirty }: { isDirty: boolean }) => {
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty)

  return <>{UnsavedChangesDialog}</>
}

describe('useUnsavedChangesGuard', () => {
  beforeEach(() => {
    mockBlockerState = 'idle'
    mockProceed.mockClear()
    mockReset.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not register beforeunload listener when not dirty', () => {
    const spy = vi.spyOn(window, 'addEventListener')

    render(<TestConsumer isDirty={false} />)

    expect(spy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('registers beforeunload listener when dirty', () => {
    const spy = vi.spyOn(window, 'addEventListener')

    render(<TestConsumer isDirty={true} />)

    expect(spy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('removes beforeunload listener on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<TestConsumer isDirty={true} />)

    unmount()

    expect(spy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('does not show dialog when blocker is idle', () => {
    mockBlockerState = 'idle'

    render(<TestConsumer isDirty={true} />)

    expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument()
  })

  it('shows dialog when blocker is blocked', () => {
    mockBlockerState = 'blocked'

    render(<TestConsumer isDirty={true} />)

    expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument()
  })

  it('calls blocker.proceed() when Discard is clicked', async () => {
    const user = userEvent.setup()
    mockBlockerState = 'blocked'

    render(<TestConsumer isDirty={true} />)

    await user.click(screen.getByRole('button', { name: /discard/i }))

    expect(mockProceed).toHaveBeenCalledOnce()
  })

  it('calls blocker.reset() when Keep editing is clicked', async () => {
    const user = userEvent.setup()
    mockBlockerState = 'blocked'

    render(<TestConsumer isDirty={true} />)

    await user.click(screen.getByRole('button', { name: /keep editing/i }))

    expect(mockReset).toHaveBeenCalledOnce()
  })
})
