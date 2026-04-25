import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE } from 'redux-persist'
import { PERSIST_KEY } from '@/store/persistKey'
import type { Notification } from '@/types'
import type { RootState } from '@/store'
import { logout, clearAuth } from './authSlice'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
}

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
}

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<Omit<Notification, 'id' | 'timestamp' | 'read'>>) => {
      const notification: Notification = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        read: false,
        ...action.payload,
      }
      state.notifications.unshift(notification)
      state.unreadCount += 1
      if (state.notifications.length > 50) {
        const evictedNotification = state.notifications[50]
        state.notifications = state.notifications.slice(0, 50) // newest-first invariant
        if (evictedNotification && !evictedNotification.read) {
          state.unreadCount = Math.max(0, state.unreadCount - 1)
        }
      }
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      const index = state.notifications.findIndex((n) => n.id === action.payload)
      if (index >= 0) {
        const notification = state.notifications[index]
        if (!notification.read) {
          state.unreadCount = Math.max(0, state.unreadCount - 1)
        }
        state.notifications.splice(index, 1)
      }
    },
    markAsRead: (state, action: PayloadAction<string>) => {
      const notification = state.notifications.find((n) => n.id === action.payload)
      if (notification && !notification.read) {
        notification.read = true
        state.unreadCount -= 1
      }
    },
    markAllAsRead: (state) => {
      state.notifications.forEach((notification) => {
        notification.read = true
      })
      state.unreadCount = 0
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(logout.fulfilled, (state) => {
        state.notifications = []
        state.unreadCount = 0
      })
      .addCase(clearAuth, (state) => {
        state.notifications = []
        state.unreadCount = 0
      })
      .addCase(REHYDRATE, (state, action: any) => {
        // payload is undefined on cold start (no persisted state) — no-op
        if (action.key === PERSIST_KEY && action.payload?.notifications) {
          const persisted = action.payload.notifications
          const capped = (persisted.notifications ?? []).slice(0, 50) // newest-first
          state.notifications = capped
          state.unreadCount = capped.filter((n: any) => !n.read).length
        }
      })
  },
})

export const {
  addNotification,
  removeNotification,
  markAsRead,
  markAllAsRead,
} = notificationSlice.actions

// Selectors
export const selectNotifications = (state: RootState) =>
  state.notifications?.notifications ?? []
export const selectUnreadCount = (state: RootState) =>
  state.notifications?.unreadCount ?? 0

export default notificationSlice.reducer
