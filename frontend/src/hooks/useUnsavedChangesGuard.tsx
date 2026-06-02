import React, { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'

export function useUnsavedChangesGuard(isDirty: boolean, isSubmitting = false): {
  UnsavedChangesDialog: React.ReactElement
} {
  const savedRef = useRef(false)

  useEffect(() => {
    if (isSubmitting) {
      savedRef.current = true
      return
    }

    // Submit ended. Clear the latch on the next tick so a navigate fired during
    // the same commit still sees it, but a failed save that leaves the form
    // dirty re-arms the guard instead of staying silently disabled.
    const id = setTimeout(() => {
      savedRef.current = false
    }, 0)

    return () => clearTimeout(id)
  }, [isSubmitting])

  const blocker = useBlocker(
    useCallback(() => isDirty && !isSubmitting && !savedRef.current, [isDirty, isSubmitting]),
  )

  useEffect(() => {
    if (!isDirty || isSubmitting) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty, isSubmitting])

  const UnsavedChangesDialog = (
    <ConfirmationDialog
      open={blocker.state === 'blocked'}
      title="Discard changes?"
      message="You have unsaved changes. Are you sure you want to leave without saving?"
      confirmText="Discard"
      cancelText="Keep editing"
      severity="warning"
      onConfirm={() => { if (blocker.state === 'blocked') blocker.proceed() }}
      onCancel={() => { if (blocker.state === 'blocked') blocker.reset() }}
    />
  )

  return { UnsavedChangesDialog }
}
