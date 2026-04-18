import { useEffect, useRef, useState } from 'react'

export interface UseFieldDuplicateCheckOptions {
  excludeId?: string
  minLength?: number
  debounceMs?: number
  skipCheck?: boolean
}

export interface UseFieldDuplicateCheckReturn {
  isChecking: boolean
  hasDuplicate: boolean
  hasChecked: boolean
  error: string | null
  successMessage: string | null
}

type FieldDuplicateCheckResult = {
  exists: boolean
  message?: string
}

export function useFieldDuplicateCheck(
  value: string,
  checkFn: (value: string, excludeId?: string) => Promise<FieldDuplicateCheckResult>,
  options?: UseFieldDuplicateCheckOptions,
): UseFieldDuplicateCheckReturn {
  const {
    excludeId,
    minLength = 2,
    debounceMs = 500,
    skipCheck = false,
  } = options ?? {}

  const [isChecking, setIsChecking] = useState(false)
  const [hasDuplicate, setHasDuplicate] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const checkFnRef = useRef(checkFn)
  checkFnRef.current = checkFn

  useEffect(() => {
    const trimmedValue = value.trim()

    if (skipCheck || trimmedValue.length < minLength) {
      setIsChecking(false)
      setHasDuplicate(false)
      setHasChecked(false)
      setError(null)
      setSuccessMessage(null)
      return
    }

    const timer = window.setTimeout(async () => {
      setIsChecking(true)

      try {
        const result = await checkFnRef.current(trimmedValue, excludeId)

        if (result.exists) {
          setHasDuplicate(true)
          setError(result.message ?? null)
          setSuccessMessage(null)
        } else {
          setHasDuplicate(false)
          setError(null)
          setSuccessMessage('✓ Available')
        }

        setHasChecked(true)
      } catch {
        setHasDuplicate(false)
        setError(null)
        setSuccessMessage(null)
        setHasChecked(false)
      } finally {
        setIsChecking(false)
      }
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [debounceMs, excludeId, minLength, skipCheck, value])

  return {
    isChecking,
    hasDuplicate,
    hasChecked,
    error,
    successMessage,
  }
}
