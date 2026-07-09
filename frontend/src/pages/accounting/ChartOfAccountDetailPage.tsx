import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Box, Tab, Tabs, Typography } from '@mui/material'

import ChartOfAccountFormDialog from '@/components/accounting/ChartOfAccountFormDialog'
import { AppButton } from '@/components/common/AppButton'
import { useGetChartOfAccountQuery } from '@/store/api/accountingApi'

import AccountJournalEntriesTab from './components/AccountJournalEntriesTab'

export default function ChartOfAccountDetailPage() {
  const { id = '' } = useParams()
  const { data: account, isLoading } = useGetChartOfAccountQuery(id)
  const [tab, setTab] = useState(0)
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading || !account) return null

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">{account.code} — {account.name}</Typography>
        <AppButton variant="primary" onClick={() => setEditOpen(true)}>Edit</AppButton>
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v as number)}>
        <Tab label="Overview" />
        <Tab label="Journal Entries" />
      </Tabs>
      {tab === 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">Account Code</Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>{account.code}</Typography>

          <Typography variant="subtitle2" color="text.secondary">Hierarchical Code</Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>{account.fullCode}</Typography>

          <Typography variant="subtitle2" color="text.secondary">Name</Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>{account.name}</Typography>

          <Typography variant="subtitle2" color="text.secondary">Type</Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>{account.type}</Typography>

          <Typography variant="subtitle2" color="text.secondary">Status</Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>{account.isActive ? 'Active' : 'Inactive'}</Typography>

          <Typography variant="subtitle2" color="text.secondary">Parent</Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>{account.parent?.code ? `${account.parent.code} — ${account.parent.name}` : '—'}</Typography>

          <Typography variant="subtitle2" color="text.secondary">Opening Balance</Typography>
          <Typography variant="body1">—</Typography>
        </Box>
      )}
      {tab === 1 && <AccountJournalEntriesTab accountId={account.id} />}
      <ChartOfAccountFormDialog
        open={editOpen}
        account={account}
        parentId={null}
        onClose={() => setEditOpen(false)}
        onSuccess={() => setEditOpen(false)}
      />
    </Box>
  )
}