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
    }
  }, [isSubmitting])

  useEffect(() => {
    if (!isDirty) {
      savedRef.current = false
    }
  }, [isDirty])

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
