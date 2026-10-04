import React from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import { useParams } from 'react-router-dom'

import { useGetBankReconciliationQuery } from '@/store/api/accountingApi'
import BankReconciliationDetailView from './BankReconciliationDetailView'

export default function BankReconciliationDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, refetch } = useGetBankReconciliationQuery(id!, {
    skip: !id,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Bank reconciliation not found.</Typography>
      </Box>
    )
  }

  return <BankReconciliationDetailView reconciliation={data} onRefetch={refetch} />
}
