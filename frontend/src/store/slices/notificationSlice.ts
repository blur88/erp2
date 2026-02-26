import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Notification } from '@/types'

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
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      const index = state.notifications.findIndex((n) => n.id === action.payload)
      if (index >= 0) {
        const notification = state.notifications[index]
        if (!notification.read) {
          state.unreadCount -= 1
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
    clearAllNotifications: (state) => {
      state.notifications = []
      state.unreadCount = 0
    },
    clearReadNotifications: (state) => {
      state.notifications = state.notifications.filter((n) => !n.read)
    },
    setNotifications: (state, action: PayloadAction<Notification[]>) => {
      if (action.payload) {
        state.notifications = action.payload
        state.unreadCount = action.payload.filter((n) => !n.read).length
      }
    },
  },
})

export const {
  addNotification,
  removeNotification,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
  clearReadNotifications,
  setNotifications,
} = notificationSlice.actions

// Selectors
export const selectNotifications = (state: any) => 
  state.notifications?.notifications
export const selectUnreadCount = (state: any) => 
  state.notifications?.unreadCount
export const selectUnreadNotifications = (state: any) => 
  state.notifications?.notifications?.filter(n => !n.read)

export default notificationSlice.reducer
