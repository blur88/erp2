import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockShowNotification, mockSocket } = vi.hoisted(() => ({
  mockShowNotification: vi.fn(),
  mockSocket: {
    on: vi.fn(),
    onAny: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    connected: true,
  },
}))

vi.mock('../useNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification }),
}))

vi.mock('../useRedux', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: any) =>
    selector({ auth: { isAuthenticated: true, accessToken: 'token' } }),
}))

vi.mock('@/store/slices/notificationSlice', () => ({
  addNotification: vi.fn(),
}))

vi.mock('socket.io-client', () => ({
  io: () => mockSocket,
}))

import { WebSocketProvider } from '../useWebSocket'

describe('useWebSocket reconnect toast debounce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does NOT show toast when reconnect happens within 5 seconds of disconnect', () => {
    const handlers: Record<string, Function> = {}
    mockSocket.on.mockImplementation((event: string, cb: Function) => {
      handlers[event] = cb
    })

    const wrapper = ({ children }: any) => (
      <WebSocketProvider>{children}</WebSocketProvider>
    )
    renderHook(() => {}, { wrapper })

    act(() => {
      handlers['disconnect']?.('transport close')
      vi.advanceTimersByTime(2000)
      handlers['reconnect']?.(1)
    })

    expect(mockShowNotification).not.toHaveBeenCalledWith(
      'Real-time connection restored',
      'success',
    )
  })

  it('DOES show toast when reconnect happens after more than 5 seconds', () => {
    const handlers: Record<string, Function> = {}
    mockSocket.on.mockImplementation((event: string, cb: Function) => {
      handlers[event] = cb
    })

    const wrapper = ({ children }: any) => (
      <WebSocketProvider>{children}</WebSocketProvider>
    )
    renderHook(() => {}, { wrapper })

    act(() => {
      handlers['disconnect']?.('transport close')
      vi.advanceTimersByTime(6000)
      handlers['reconnect']?.(1)
    })

    expect(mockShowNotification).toHaveBeenCalledWith(
      'Real-time connection restored',
      'success',
    )
  })
})
