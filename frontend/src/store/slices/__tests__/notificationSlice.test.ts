import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { REHYDRATE } from 'redux-persist'
import type { Notification } from '@/types'
import { PERSIST_KEY } from '../../persistKey'
import notificationReducer, {
  addNotification,
  removeNotification,
  markAsRead,
  markAllAsRead,
  notificationsRestored,
  selectNotifications,
  selectUnreadCount,
} from '../notificationSlice'
import { sessionEnded } from '../authSlice'

// Mock authApi to avoid import errors
vi.mock('@/services/authApi', () => ({
  default: {
    changePassword: vi.fn(),
    getCurrentUser: vi.fn(),
    shouldShowDefaultCredentials: vi.fn(),
  },
  authApi: {
    changePassword: vi.fn(),
    getCurrentUser: vi.fn(),
    shouldShowDefaultCredentials: vi.fn(),
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
    const notifications = selectNotifications(store.getState())
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Test')
    expect(notifications[0].read).toBe(false)
    expect(typeof notifications[0].timestamp).toBe('string')
  })

  it('should clear all notifications on session end', () => {
    // Add some notifications
    store.dispatch(addNotification({ type: 'success', title: 'A', message: 'msg' }))
    store.dispatch(addNotification({ type: 'error', title: 'B', message: 'msg' }))
    expect(selectNotifications(store.getState())).toHaveLength(2)
    expect(selectUnreadCount(store.getState())).toBe(2)

    // Simulate a session-ending event
    store.dispatch(sessionEnded())

    expect(selectNotifications(store.getState())).toHaveLength(0)
    expect(selectUnreadCount(store.getState())).toBe(0)
  })

  // -- Cap at 50 -----------------------------------------------------------

  it('caps notifications at 50 when a 51st is added', () => {
    for (let i = 0; i < 51; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    const notifications = selectNotifications(store.getState())
    expect(notifications).toHaveLength(50)
  })

  it('drops the oldest notification when cap is exceeded', () => {
    // Add 50 notifications -- oldest is "first"
    for (let i = 0; i < 50; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    // Add a 51st -- "newest" should be at index 0, "first" should be gone
    store.dispatch(addNotification({ type: 'success', title: 'newest', message: 'm' }))
    const notifications = selectNotifications(store.getState())
    expect(notifications[0].title).toBe('newest')
    expect(notifications.find((n) => n.title === 'N0')).toBeUndefined()
  })

  it('keeps unreadCount correct after cap is applied', () => {
    for (let i = 0; i < 51; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    expect(selectUnreadCount(store.getState())).toBe(50)
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

    const nextNotifications = selectNotifications(store.getState())
    expect(nextNotifications).toHaveLength(50)
    expect(nextNotifications[0].title).toBe('newest')
    expect(nextNotifications.find((notification) => notification.id === 'id-49')).toBeUndefined()
    expect(selectUnreadCount(store.getState())).toBe(20)
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

    expect(selectNotifications(store.getState())).toEqual([unreadNotification])
    expect(selectUnreadCount(store.getState())).toBe(0)

    store.dispatch(removeNotification(unreadNotification.id))

    expect(selectNotifications(store.getState())).toEqual([])
    expect(selectUnreadCount(store.getState())).toBe(0)
  })

  // -- REHYDRATE ------------------------------------------------------------

  function makeNotification(i: number, read = false) {
    return {
      id: `id-${i}`,
      type: 'info' as const,
      title: `N${i}`,
      message: 'm',
      timestamp: new Date().toISOString(),
      read,
    }
  }

  it('trims to 50 and recalculates unreadCount on REHYDRATE with 60 notifications', () => {
    const notifications = Array.from({ length: 60 }, (_, i) => makeNotification(i))
    store.dispatch({
      type: REHYDRATE,
      key: PERSIST_KEY,
      payload: { notifications: { notifications, unreadCount: 60 } },
    })
    expect(selectNotifications(store.getState())).toHaveLength(50)
    expect(selectUnreadCount(store.getState())).toBe(50)
  })

  it('preserves existing state on REHYDRATE when payload is undefined', () => {
    const existingNotifications = [makeNotification(0, false), makeNotification(1, true)]
    store = createTestStore({
      notifications: {
        notifications: existingNotifications,
        unreadCount: 1,
      },
    })

    store.dispatch({ type: REHYDRATE, key: PERSIST_KEY, payload: undefined })

    expect(selectNotifications(store.getState())).toEqual(existingNotifications)
    expect(selectUnreadCount(store.getState())).toBe(1)
  })

  it('recalculates unreadCount correctly on REHYDRATE with mixed read/unread', () => {
    const notifications = [
      makeNotification(0, true),
      makeNotification(1, false),
      makeNotification(2, false),
    ]
    store.dispatch({
      type: REHYDRATE,
      key: PERSIST_KEY,
      payload: { notifications: { notifications, unreadCount: 99 } },
    })
    expect(selectUnreadCount(store.getState())).toBe(2)
  })

  it('markAsRead decrements unreadCount correctly after REHYDRATE', () => {
    const notifications = [makeNotification(0, false), makeNotification(1, false)]
    store.dispatch({
      type: REHYDRATE,
      key: PERSIST_KEY,
      payload: { notifications: { notifications, unreadCount: 2 } },
    })
    store.dispatch(markAsRead('id-0'))
    expect(selectUnreadCount(store.getState())).toBe(1)
  })

  it('markAllAsRead sets unreadCount to 0 after REHYDRATE', () => {
    const notifications = [makeNotification(0, false), makeNotification(1, false)]
    store.dispatch({
      type: REHYDRATE,
      key: PERSIST_KEY,
      payload: { notifications: { notifications, unreadCount: 2 } },
    })
    store.dispatch(markAllAsRead())
    expect(selectUnreadCount(store.getState())).toBe(0)
  })
  describe('notificationsRestored', () => {
    const at = (id: string, second: number, read = false): Notification => ({
      id,
      type: 'info',
      title: id,
      message: 'm',
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
      read,
    })
    const held = (notifications: Notification[]) =>
      createTestStore({ notifications: { notifications, unreadCount: notifications.filter((n) => !n.read).length } })
    const ids = (s: ReturnType<typeof createTestStore>) => selectNotifications(s.getState()).map((n) => n.id)

    it('adds the stored list to what the tab holds, newest first', () => {
      const s = held([at('own-new', 30), at('own-old', 10)])
      s.dispatch(notificationsRestored([at('stored-new', 20), at('stored-old', 5, true)]))
      expect(ids(s)).toEqual(['own-new', 'stored-new', 'own-old', 'stored-old'])
      expect(selectUnreadCount(s.getState())).toBe(3)
    })

    it('keeps the tab\u2019s copy when both hold an id', () => {
      const s = held([at('shared', 10, true)])
      s.dispatch(notificationsRestored([at('shared', 10, false), at('shared', 10, false)]))
      expect(selectNotifications(s.getState())).toEqual([at('shared', 10, true)])
      expect(selectUnreadCount(s.getState())).toBe(0)
    })

    it('caps the merged list at 50 and counts unread over what is kept', () => {
      const s = held([at('own', 59)])
      s.dispatch(notificationsRestored(Array.from({ length: 55 }, (_, i) => at(`stored-${i}`, 55 - i, i === 0))))
      const list = selectNotifications(s.getState())
      expect(list).toHaveLength(50)
      expect(list[0].id).toBe('own')
      expect(list[49].id).toBe('stored-48')
      expect(selectUnreadCount(s.getState())).toBe(49)
    })

    it('into an empty list installs the stored one', () => {
      const s = held([])
      s.dispatch(notificationsRestored([at('a', 2), at('b', 1, true)]))
      expect(ids(s)).toEqual(['a', 'b'])
      expect(selectUnreadCount(s.getState())).toBe(1)
    })
  })
})
