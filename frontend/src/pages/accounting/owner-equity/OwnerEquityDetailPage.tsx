import { Box, CircularProgress, Typography } from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import { useParams } from 'react-router-dom'

import { useGetOwnerEquityQuery } from '@/store/api/accountingApi'

import OwnerEquityDetailView from './OwnerEquityDetailView'

export default function OwnerEquityDetailPage() {
  const { referenceNumber } = useParams<{ referenceNumber: string }>()
  const { data: document, isLoading, isError } = useGetOwnerEquityQuery(referenceNumber ?? skipToken)

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !document) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Owner equity document not found.</Typography>
      </Box>
    )
  }

  return <OwnerEquityDetailView document={document} />
}
