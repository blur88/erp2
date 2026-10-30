import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import type { Notification } from '@/types'
import notificationReducer, {
  addNotification,
  removeNotification,
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

function createTestStore(
  preloadedState?: {
    notifications: {
      notifications: Notification[]
      unreadCount: number
    }
  },
) {
  return configureStore({
    reducer: { notifications: notificationReducer },
    preloadedState,
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
    const notifications = selectNotifications({ ...store.getState() })
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Test')
    expect(notifications[0].read).toBe(false)
    expect(typeof notifications[0].timestamp).toBe('string')
  })

  it('should clear all notifications on logout.fulfilled', () => {
    // Add some notifications
    store.dispatch(addNotification({ type: 'success', title: 'A', message: 'msg' }))
    store.dispatch(addNotification({ type: 'error', title: 'B', message: 'msg' }))
    expect(selectNotifications({ ...store.getState() })).toHaveLength(2)
    expect(selectUnreadCount({ ...store.getState() })).toBe(2)

    // Simulate logout.fulfilled
    store.dispatch({ type: logout.fulfilled.type })

    expect(selectNotifications({ ...store.getState() })).toHaveLength(0)
    expect(selectUnreadCount({ ...store.getState() })).toBe(0)
  })

  // -- Cap at 50 -----------------------------------------------------------

  it('caps notifications at 50 when a 51st is added', () => {
    for (let i = 0; i < 51; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    const notifications = selectNotifications({ ...store.getState() })
    expect(notifications).toHaveLength(50)
  })

  it('drops the oldest notification when cap is exceeded', () => {
    // Add 50 notifications -- oldest is "first"
    for (let i = 0; i < 50; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    // Add a 51st -- "newest" should be at index 0, "first" should be gone
    store.dispatch(addNotification({ type: 'success', title: 'newest', message: 'm' }))
    const notifications = selectNotifications({ ...store.getState() })
    expect(notifications[0].title).toBe('newest')
    expect(notifications.find((n) => n.title === 'N0')).toBeUndefined()
  })

  it('keeps unreadCount correct after cap is applied', () => {
    for (let i = 0; i < 51; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    expect(selectUnreadCount({ ...store.getState() })).toBe(50)
  })

  it('keeps unreadCount stable when capping evicts an unread item from a mixed list', () => {
    const notifications = Array.from({ length: 50 }, (_, i) => makeNotification(i, i < 30))
    store = createTestStore({
      notifications: {
        notifications,
        unreadCount: 20,
      },
    })

    store.dispatch(addNotification({ type: 'info', title: 'newest', message: 'm' }))

    const nextNotifications = selectNotifications({ ...store.getState() })
    expect(nextNotifications).toHaveLength(50)
    expect(nextNotifications[0].title).toBe('newest')
    expect(nextNotifications.find((notification) => notification.id === 'id-49')).toBeUndefined()
    expect(selectUnreadCount({ ...store.getState() })).toBe(20)
  })

  // -- removeNotification floor guard --------------------------------------

  it('does not decrement unreadCount below zero on removeNotification', () => {
    const unreadNotification: Notification = {
      id: 'floor-guard-id',
      type: 'info',
      title: 'X',
      message: 'm',
      timestamp: new Date().toISOString(),
      read: false,
    }

    store = createTestStore({
      notifications: {
        notifications: [unreadNotification],
        unreadCount: 0,
      },
    })

    expect(selectNotifications({ ...store.getState() })).toEqual([unreadNotification])
    expect(selectUnreadCount({ ...store.getState() })).toBe(0)

    store.dispatch(removeNotification(unreadNotification.id))

    expect(selectNotifications({ ...store.getState() })).toEqual([])
    expect(selectUnreadCount({ ...store.getState() })).toBe(0)
  })

  function makeNotification(i: number, read = false): Notification {
    return { id: `id-${i}`, type: 'info', title: `N${i}`, message: 'm', timestamp: '2026-10-31T00:00:00.000Z', read }
  }

  it('ignores legacy persisted notification payloads', () => {
    store.dispatch({ type: 'persist/REHYDRATE', key: 'erp-notifications',
      payload: { notifications: { notifications: [{ id: 'legacy', read: false }], unreadCount: 1 } } })
    expect(store.getState().notifications).toEqual({ notifications: [], unreadCount: 0 })
  })
})
