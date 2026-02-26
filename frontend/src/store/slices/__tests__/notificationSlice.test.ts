import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import notificationReducer, {
  addNotification,
  selectNotifications,
  selectUnreadCount,
} from '../notificationSlice'
import { logout } from '../authSlice'

// Mock authApi to avoid import errors
vi.mock('@/services/authApi', () => ({
  default: {
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    register: vi.fn(),
    changePassword: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

function createTestStore() {
  return configureStore({
    reducer: { notifications: notificationReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  })
}

describe('notificationSlice', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore()
  })

  it('should add a notification', () => {
    store.dispatch(addNotification({ type: 'success', title: 'Test', message: 'Hello' }))
    const notifications = selectNotifications(store.getState())
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Test')
    expect(notifications[0].read).toBe(false)
    expect(typeof notifications[0].timestamp).toBe('string')
  })

  it('should clear all notifications on logout.fulfilled', () => {
    // Add some notifications
    store.dispatch(addNotification({ type: 'success', title: 'A', message: 'msg' }))
    store.dispatch(addNotification({ type: 'error', title: 'B', message: 'msg' }))
    expect(selectNotifications(store.getState())).toHaveLength(2)
    expect(selectUnreadCount(store.getState())).toBe(2)

    // Simulate logout.fulfilled
    store.dispatch({ type: logout.fulfilled.type })

    expect(selectNotifications(store.getState())).toHaveLength(0)
    expect(selectUnreadCount(store.getState())).toBe(0)
  })
})
