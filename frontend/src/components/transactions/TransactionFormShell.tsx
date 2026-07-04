import React from 'react'
import { Box, Grid } from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'

interface TransactionFormShellProps {
  title: string
  subtitle?: string
  backAction: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  isSaving: boolean
  submitLabel: string
  cancelLabel?: string
  submitDisabled?: boolean
  showLoadingSpinner?: boolean
  onCancel: () => void
  children: React.ReactNode
}

export default function TransactionFormShell({
  title,
  subtitle,
  backAction,
  onSubmit,
  isSaving,
  submitLabel,
  cancelLabel = 'Cancel',
  submitDisabled = false,
  showLoadingSpinner = true,
  onCancel,
  children,
}: TransactionFormShellProps) {
  return (
    <>
      <PageHeader variant="workflow" title={title} subtitle={subtitle} backAction={backAction} />
      <form noValidate onSubmit={onSubmit}>
        <Grid container spacing={3}>
          {children}
          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <AppButton variant="secondary" onClick={onCancel} disabled={isSaving}>
                {cancelLabel}
              </AppButton>
              <AppButton
                variant="primary"
                type="submit"
                disabled={isSaving || submitDisabled}
                {...(showLoadingSpinner && isSaving ? { loading: true } : {})}
              >
                {submitLabel}
              </AppButton>
            </Box>
          </Grid>
        </Grid>
      </form>
    </>
  )
}
