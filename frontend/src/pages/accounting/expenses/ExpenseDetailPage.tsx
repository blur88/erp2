import { Box, CircularProgress, Typography } from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import { useParams } from 'react-router-dom'

import { useGetExpenseQuery } from '@/store/api/accountingApi'

import ExpenseDetailView from './ExpenseDetailView'

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: expense, isLoading, isError } = useGetExpenseQuery(id ?? skipToken)

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !expense) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Expense not found.</Typography>
      </Box>
    )
  }

  return <ExpenseDetailView expense={expense} />
}
