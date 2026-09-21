import { Box, CircularProgress, Typography } from '@mui/material'
import { useParams } from 'react-router-dom'

import { useGetProviderSettlementQuery } from '@/store/api/accountingApi'

import ProviderSettlementDetailView from './ProviderSettlementDetailView'

export default function ProviderSettlementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError } = useGetProviderSettlementQuery(id!, { skip: !id })

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
        <Typography color="text.secondary">Provider settlement not found.</Typography>
      </Box>
    )
  }

  return <ProviderSettlementDetailView settlement={data} />
}
