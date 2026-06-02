import React, { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'

export function useUnsavedChangesGuard(isDirty: boolean): {
  UnsavedChangesDialog: React.ReactElement
} {
  const blocker = useBlocker(useCallback(() => isDirty, [isDirty]))

  useEffect(() => {
    if (!isDirty) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty])

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
