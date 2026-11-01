import { useState, useEffect, useCallback, useRef } from 'react'

interface UseIdleTimerOptions {
  /**
   * Timeout in milliseconds before user is considered idle
   * @default 3600000 (60 minutes)
   */
  timeout?: number

  /**
   * Warning time in milliseconds before logout
   * @default 300000 (5 minutes)
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

  getLastActivity?: () => Promise<number | null>
  onActivity?: (now: number) => Promise<unknown>
  onIdleTimeout?: () => Promise<unknown>

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
  reset: () => Promise<void>

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
 *   timeout: 12 * 60 * 60 * 1000, // 12 hours
 *   warningTime: 5 * 60 * 1000, // 5 minutes warning
 *   onTimeout: () => logout(),
 * })
 * ```
 */
export function useIdleTimer(options: UseIdleTimerOptions = {}): UseIdleTimerReturn {
  const {
    timeout = 12 * 60 * 60 * 1000, // 12 hours default
    warningTime = 5 * 60 * 1000, // 5 minutes warning default
    onIdle,
    onTimeout,
    onActive,
    getLastActivity,
    onActivity,
    onIdleTimeout,
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
  const activityWriteRef = useRef<Promise<unknown>>(Promise.resolve())
  const recheckIdleRef = useRef<() => void>(() => {})

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
  const startCountdown = useCallback((remaining = warningTime) => {
    const warningTimeInSeconds = Math.ceil(remaining / 1000)
    setRemainingTime(warningTimeInSeconds)

    // Update remaining time every second
    countdownIntervalRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
          countdownIntervalRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Set timeout for actual logout
    timeoutTimerRef.current = setTimeout(() => {
      clearTimers()
      setRemainingTime(0)
      if (onIdleTimeout) {
        void onIdleTimeout().then(ended => { if (!ended) recheckIdleRef.current() }).catch(() => {})
      } else onTimeout?.()
    }, remaining)
    onIdle?.()
  }, [warningTime, onTimeout, onIdle, onIdleTimeout, clearTimers])

  // Reset the idle timer
  const reset = useCallback((persist = true): Promise<void> => {
    if (!enabled || isPaused) return Promise.resolve()

    const now = Date.now()
    lastActivityRef.current = now
    if (persist && onActivity) activityWriteRef.current = activityWriteRef.current.then(() => onActivity(now))
    clearTimers()

    // If was idle, trigger onActive callback
    if (isIdleRef.current) {
      setIsIdle(false)
      isIdleRef.current = false
      setRemainingTime(0)
      onActive?.()
    }

    const write = persist && onActivity ? activityWriteRef.current : Promise.resolve()
    void write.catch(() => {})

    // Set timer to trigger idle state (show warning)
    const idleDelay = timeout - warningTime
    idleTimerRef.current = setTimeout(() => {
      void (async () => {
        if (getLastActivity) await activityWriteRef.current
        const sharedLastActivity = getLastActivity ? await getLastActivity() : lastActivityRef.current
        if (getLastActivity) {
          if (sharedLastActivity === null) return
          const elapsed = Date.now() - sharedLastActivity
          if (elapsed < idleDelay) {
            idleTimerRef.current = setTimeout(() => reset(false), Math.max(1000, idleDelay - elapsed))
            return
          }
          const lastAtWarning = sharedLastActivity ?? lastActivityRef.current
          const remaining = Math.max(0, timeout - (Date.now() - lastAtWarning))
          if (!onIdleTimeout) {
            setIsIdle(true)
            isIdleRef.current = true
            onIdle?.()
          }
          startCountdown(remaining)
          return
        }
        setIsIdle(true)
        isIdleRef.current = true
        startCountdown()
      })().catch(() => {})
    }, idleDelay)
    return write.then(() => undefined)
  }, [enabled, isPaused, timeout, warningTime, onIdle, onActive, onActivity, onIdleTimeout, getLastActivity, clearTimers, startCountdown])
  recheckIdleRef.current = () => {
    if (!getLastActivity) { void reset(false); return }
    void getLastActivity().then(latest => {
      if (latest === null) return
      const elapsed = Date.now() - latest
      const idleDelay = timeout - warningTime
      if (elapsed >= idleDelay) {
        setIsIdle(true)
        isIdleRef.current = true
        startCountdown(Math.max(0, timeout - elapsed))
      } else {
        idleTimerRef.current = setTimeout(() => recheckIdleRef.current(), Math.max(1000, idleDelay - elapsed))
      }
    }).catch(() => {})
  }

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

  const stayActive = useCallback(() => reset(), [reset])

  // Event handler for user activity
  const handleActivity = useCallback(() => {
    void reset().catch(() => {
      if (onActivity) window.alert("Unable to update session activity. This browser's storage is unavailable.")
    })
  }, [onActivity, reset])

  // Check for elapsed time on window focus (handles laptop standby/sleep)
  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        // Window became visible, check if too much time has passed
        const now = Date.now()
        const sharedLastActivity = getLastActivity ? await getLastActivity() : null
        const lastActivity = sharedLastActivity ?? lastActivityRef.current
        lastActivityRef.current = lastActivity
        const elapsed = now - lastActivity

        // If more time has passed than the timeout, force logout
        if (elapsed >= timeout) {
          console.warn(`[useIdleTimer] Laptop was asleep for ${Math.floor(elapsed / 1000 / 60)} minutes, forcing logout`)
          clearTimers()
          setIsIdle(false)
          isIdleRef.current = false
          if (onIdleTimeout) void onIdleTimeout().then(ended => { if (!ended) recheckIdleRef.current() }).catch(() => {})
          else onTimeout?.()
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
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
                countdownIntervalRef.current = null
                return 0
              }
              return prev - 1
            })
          }, 1000)

          // Set timeout for actual logout
          timeoutTimerRef.current = setTimeout(() => {
            clearTimers()
            setRemainingTime(0)
            if (onIdleTimeout) void onIdleTimeout().then(ended => { if (!ended) recheckIdleRef.current() }).catch(() => {})
            else onTimeout?.()
          }, timeRemaining)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, timeout, warningTime, onIdle, onTimeout, onIdleTimeout, getLastActivity, clearTimers])

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
    reset: stayActive,
    pause,
    resume,
  }
}
