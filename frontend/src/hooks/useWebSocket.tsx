import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useNotification } from './useNotification'
import { useAppDispatch } from './useRedux'
import { addNotification } from '@/store/slices/notificationSlice'
import type { WebSocketMessage, RealtimeUpdate } from '@/types'

interface WebSocketContextType {
  socket: Socket | null
  isConnected: boolean
  lastMessage: WebSocketMessage | null
  sendMessage: (event: string, data: any) => void
  subscribe: (event: string, callback: (data: any) => void) => () => void
  unsubscribe: (event: string, callback?: (data: any) => void) => void
}

const WebSocketContext = createContext<WebSocketContextType | null>(null)

const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || 'http://localhost:3001'

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authentication removed - WebSocket will connect without auth
  const isAuthenticated = true
  const token = null
  const { showNotification } = useNotification()
  const dispatch = useAppDispatch()
  
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const listenersRef = useRef<Map<string, Set<Function>>>(new Map())

  // Initialize WebSocket connection
  useEffect(() => {
    if (!socketRef.current) {
      console.log('Connecting to WebSocket...')
      
      const socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        retries: 3,
      })

      socketRef.current = socket

      // Connection handlers
      socket.on('connect', () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        showNotification('Real-time connection established', 'success')
      })

      socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason)
        setIsConnected(false)
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, try to reconnect
          socket.connect()
        }
      })

      socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error)
        setIsConnected(false)
        if (error.message.includes('unauthorized')) {
          showNotification('Authentication failed for real-time connection', 'error')
        }
      })

      socket.on('reconnect', (attemptNumber) => {
        console.log('WebSocket reconnected after', attemptNumber, 'attempts')
        setIsConnected(true)
        showNotification('Real-time connection restored', 'success')
      })

      socket.on('reconnect_failed', () => {
        console.error('WebSocket reconnection failed')
        showNotification('Failed to restore real-time connection', 'error')
      })

      // Global message handler
      socket.onAny((event, data) => {
        const message: WebSocketMessage = {
          type: event,
          payload: data,
          timestamp: new Date(),
        }
        setLastMessage(message)

        // Call registered listeners
        const listeners = listenersRef.current.get(event)
        if (listeners) {
          listeners.forEach(callback => callback(data))
        }
      })

      // Handle real-time updates
      socket.on('realtime_update', (update: RealtimeUpdate) => {
        console.log('Real-time update:', update)
        
        // Show notification for important updates
        if (update.entity === 'order' && update.action === 'created') {
          showNotification(`New order created: #${update.data.orderNumber}`, 'info')
        } else if (update.entity === 'inventory' && update.action === 'updated') {
          if (update.data.stock <= update.data.minStock) {
            showNotification(`Low stock alert: ${update.data.name}`, 'warning')
          }
        } else if (update.entity === 'payment' && update.action === 'created') {
          showNotification(`Payment received: $${update.data.amount}`, 'success')
        }

        // Add to notification store
        dispatch(addNotification({
          type: 'info',
          title: 'Real-time Update',
          message: `${update.entity} ${update.action}`,
        }))
      })

      // Handle system notifications
      socket.on('system_notification', (notification: {
        type: 'info' | 'warning' | 'error' | 'success'
        title: string
        message: string
      }) => {
        showNotification(notification.message, notification.type, notification.title)
      })

      // Handle business alerts
      socket.on('business_alert', (alert: {
        type: 'inventory_low' | 'payment_overdue' | 'system_maintenance'
        title: string
        message: string
        priority: 'low' | 'medium' | 'high'
        data?: any
      }) => {
        const severityMap = {
          inventory_low: 'warning' as const,
          payment_overdue: 'error' as const,
          system_maintenance: 'info' as const,
        }

        showNotification(
          alert.message,
          severityMap[alert.type] || 'info',
          alert.title
        )
      })

      return () => {
        if (socket) {
          console.log('Cleaning up WebSocket connection')
          socket.disconnect()
          socketRef.current = null
          setIsConnected(false)
        }
      }
    }
  }, [showNotification, dispatch])

  // Cleanup on unmount or auth change
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setIsConnected(false)
      }
    }
  }, [])

  // Send message
  const sendMessage = useCallback((event: string, data: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data)
    } else {
      console.warn('WebSocket not connected, message not sent:', event, data)
    }
  }, [isConnected])

  // Subscribe to events
  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    const listeners = listenersRef.current.get(event) || new Set()
    listeners.add(callback)
    listenersRef.current.set(event, listeners)

    // Return unsubscribe function
    return () => {
      const currentListeners = listenersRef.current.get(event)
      if (currentListeners) {
        currentListeners.delete(callback)
        if (currentListeners.size === 0) {
          listenersRef.current.delete(event)
        }
      }
    }
  }, [])

  // Unsubscribe from events
  const unsubscribe = useCallback((event: string, callback?: (data: any) => void) => {
    if (callback) {
      const listeners = listenersRef.current.get(event)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          listenersRef.current.delete(event)
        }
      }
    } else {
      listenersRef.current.delete(event)
    }
  }, [])

  const value: WebSocketContextType = {
    socket: socketRef.current,
    isConnected,
    lastMessage,
    sendMessage,
    subscribe,
    unsubscribe,
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}

// Custom hooks for specific real-time features
export const useRealtimeUpdates = (entity: string, onUpdate: (data: any) => void) => {
  const { subscribe } = useWebSocket()

  useEffect(() => {
    const unsubscribe = subscribe(`${entity}_updated`, onUpdate)
    return unsubscribe
  }, [entity, onUpdate, subscribe])
}

export const useBusinessAlerts = (onAlert: (alert: any) => void) => {
  const { subscribe } = useWebSocket()

  useEffect(() => {
    const unsubscribe = subscribe('business_alert', onAlert)
    return unsubscribe
  }, [onAlert, subscribe])
}