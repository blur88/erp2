import { useState, useEffect, useCallback, useRef } from 'react'

interface UseIdleTimerOptions {
  /**
   * Timeout in milliseconds before user is considered idle
   * @default 3600000 (60 minutes)
   */
  timeout?: number

  /**
   * Warning time in milliseconds before logout
   * @default 120000 (2 minutes)
   */
  warningTime?: number

  /**
   * Callback when user becomes idle (warning shown)
   */
  onIdle?: () => void

  /**
   * Callback when timeout expires (auto-logout)
   */
  onTimeout?: () => void

  /**
   * Callback when user becomes active again
   */
  onActive?: () => void

  /**
   * Events that should reset the idle timer
   * @default ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
   */
  events?: string[]

  /**
   * Whether the timer is enabled
   * @default true
   */
  enabled?: boolean
}

interface UseIdleTimerReturn {
  /** Whether user is currently idle (warning period) */
  isIdle: boolean

  /** Remaining time in seconds until logout (only during warning period) */
  remainingTime: number

  /** Reset the idle timer manually */
  reset: () => void

  /** Pause the idle timer */
  pause: () => void

  /** Resume the idle timer */
  resume: () => void
}

/**
 * Hook to detect user inactivity and trigger auto-logout
 *
 * @example
 * ```tsx
 * const { isIdle, remainingTime, reset } = useIdleTimer({
 *   timeout: 60 * 60 * 1000, // 60 minutes
 *   warningTime: 2 * 60 * 1000, // 2 minutes warning
 *   onTimeout: () => logout(),
 * })
 * ```
 */
export function useIdleTimer(options: UseIdleTimerOptions = {}): UseIdleTimerReturn {
  const {
    timeout = 60 * 60 * 1000, // 60 minutes default
    warningTime = 2 * 60 * 1000, // 2 minutes warning default
    onIdle,
    onTimeout,
    onActive,
    events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'],
    enabled = true,
  } = options

  const [isIdle, setIsIdle] = useState(false)
  const [remainingTime, setRemainingTime] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const isIdleRef = useRef<boolean>(false)

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current)
      timeoutTimerRef.current = null
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }, [])

  // Start countdown during warning period
  const startCountdown = useCallback(() => {
    const warningTimeInSeconds = warningTime / 1000
    setRemainingTime(warningTimeInSeconds)

    // Update remaining time every second
    countdownIntervalRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          clearTimers()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Set timeout for actual logout
    timeoutTimerRef.current = setTimeout(() => {
      clearTimers()
      setRemainingTime(0)
      onTimeout?.()
    }, warningTime)
  }, [warningTime, onTimeout, clearTimers])

  // Reset the idle timer
  const reset = useCallback(() => {
    if (!enabled || isPaused) return

    lastActivityRef.current = Date.now()
    clearTimers()

    // If was idle, trigger onActive callback
    if (isIdleRef.current) {
      setIsIdle(false)
      isIdleRef.current = false
      setRemainingTime(0)
      onActive?.()
    }

    // Set timer to trigger idle state (show warning)
    const idleDelay = timeout - warningTime
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true)
      isIdleRef.current = true
      onIdle?.()
      startCountdown()
    }, idleDelay)
  }, [enabled, isPaused, timeout, warningTime, onIdle, onActive, clearTimers, startCountdown])

  // Pause the timer
  const pause = useCallback(() => {
    setIsPaused(true)
    clearTimers()
  }, [clearTimers])

  // Resume the timer
  const resume = useCallback(() => {
    setIsPaused(false)
    reset()
  }, [reset])

  // Event handler for user activity
  const handleActivity = useCallback(() => {
    reset()
  }, [reset])

  // Check for elapsed time on window focus (handles laptop standby/sleep)
  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Window became visible, check if too much time has passed
        const now = Date.now()
        const elapsed = now - lastActivityRef.current

        // If more time has passed than the timeout, force logout
        if (elapsed >= timeout) {
          console.warn(`[useIdleTimer] Laptop was asleep for ${Math.floor(elapsed / 1000 / 60)} minutes, forcing logout`)
          clearTimers()
          setIsIdle(false)
          isIdleRef.current = false
          onTimeout?.()
          return
        }

        // If we're in the warning period, show the warning
        const idleDelay = timeout - warningTime
        if (elapsed >= idleDelay && elapsed < timeout) {
          const timeRemaining = timeout - elapsed
          console.warn(`[useIdleTimer] Laptop was asleep, showing warning with ${Math.floor(timeRemaining / 1000)} seconds remaining`)
          setIsIdle(true)
          isIdleRef.current = true
          onIdle?.()

          // Start countdown with actual remaining time
          const remainingSeconds = Math.ceil(timeRemaining / 1000)
          setRemainingTime(remainingSeconds)

          // Clear existing timers
          clearTimers()

          // Update remaining time every second
          countdownIntervalRef.current = setInterval(() => {
            setRemainingTime((prev) => {
              if (prev <= 1) {
                clearTimers()
                return 0
              }
              return prev - 1
            })
          }, 1000)

          // Set timeout for actual logout
          timeoutTimerRef.current = setTimeout(() => {
            clearTimers()
            setRemainingTime(0)
            onTimeout?.()
          }, timeRemaining)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, timeout, warningTime, onIdle, onTimeout, clearTimers])

  // Setup event listeners
  useEffect(() => {
    if (!enabled) {
      clearTimers()
      return
    }

    // Add event listeners for user activity
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // Start the timer
    reset()

    // Cleanup
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
      clearTimers()
    }
  }, [enabled, events, handleActivity, reset, clearTimers])

  return {
    isIdle,
    remainingTime: Math.ceil(remainingTime),
    reset,
    pause,
    resume,
  }
}
