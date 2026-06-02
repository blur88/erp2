import React, { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'

export function useUnsavedChangesGuard(isDirty: boolean): {
  UnsavedChangesDialog: React.ReactElement
} {
  const blocker = useBlocker(() => isDirty)

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

  const UnsavedChangesDialog = React.createElement(ConfirmationDialog, {
    open: blocker.state === 'blocked',
    title: 'Discard changes?',
    message: 'You have unsaved changes. Are you sure you want to leave without saving?',
    confirmText: 'Discard',
    cancelText: 'Keep editing',
    severity: 'warning' as const,
    onConfirm: () => blocker.proceed?.(),
    onCancel: () => blocker.reset?.(),
  })

  return { UnsavedChangesDialog }
}
