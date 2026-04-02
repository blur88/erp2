import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import {
  Cancel as CancelIcon,
} from '@mui/icons-material'
import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelFundTransferMutation,
  useCreateFundTransferMutation,
  useGetChartOfAccountsQuery,
  useGetFundTransfersQuery,
} from '@/store/api/accountingApi'
import type { ChartOfAccount, FundTransfer } from '@/types'
import { formatCurrency, formatDate, getCurrentDate } from '@/utils/formatters'

type FormState = {
  sourceAccountId: string
  destinationAccountId: string
  amount: string
  transferDate: string
  description: string
}

const defaultForm: FormState = {
  sourceAccountId: '',
  destinationAccountId: '',
  amount: '',
  transferDate: getCurrentDate(),
  description: '',
}

type AppStore = {
  getState: () => { auth?: { user?: { role?: string } | null } }
  subscribe: (listener: () => void) => () => void
}

const getFallbackStore = (): AppStore | null => {
  const runtimeStore = (window as any).store as AppStore | undefined
  if (runtimeStore?.getState && runtimeStore?.subscribe) {
    return runtimeStore
  }

  return null
}

const FundTransfersPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [appStore, setAppStore] = useState<AppStore | null>(() => getFallbackStore())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<FundTransfer | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState<FormState>(defaultForm)

  const filters = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status: statusFilter || undefined,
    }),
    [endDate, startDate, statusFilter],
  )

  const { data, isLoading, refetch } = useGetFundTransfersQuery(filters)
  const { data: accountsResponse } = useGetChartOfAccountsQuery({
    isCashEquivalent: true,
    limit: 200,
  })
  const [createFundTransfer, { isLoading: creating }] =
    useCreateFundTransferMutation()
  const [cancelFundTransfer, { isLoading: cancelling }] =
    useCancelFundTransferMutation()
  const subscribeToRoleChanges = (onStoreChange: () => void) =>
    appStore?.subscribe(onStoreChange) ?? (() => undefined)
  const getStoreRoleSnapshot = () =>
    appStore?.getState()?.auth?.user?.role ?? null
  const currentUserRole = useSyncExternalStore(
    subscribeToRoleChanges,
    getStoreRoleSnapshot,
    getStoreRoleSnapshot,
  )
  const canManageTransfers =
    currentUserRole === 'admin' ||
    currentUserRole === 'manager'

  useEffect(() => {
    let active = true

    import('@/store')
      .then((module) => {
        if (active) {
          setAppStore(module.store as AppStore)
        }
      })
      .catch(() => {
        // Isolated page tests fully mock accountingApi, so the app store module
        // is not always available in that environment.
      })

    return () => {
      active = false
    }
  }, [])

  const transfers = data?.data ?? []
  const cashAccounts = useMemo(
    () =>
      ((accountsResponse?.data ?? []) as ChartOfAccount[]).filter(
        (account) => account.isActive && account.isCashEquivalent,
      ),
    [accountsResponse],
  )

  const availableDestinations = useMemo(
    () => cashAccounts.filter((account) => account.id !== form.sourceAccountId),
    [cashAccounts, form.sourceAccountId],
  )

  const resetForm = () => {
    setDialogOpen(false)
    setForm(defaultForm)
  }

  const handleCreate = async () => {
    if (
      !form.sourceAccountId ||
      !form.destinationAccountId ||
      !form.amount ||
      !form.transferDate
    ) {
      showError('Please fill in all required fields')
      return
    }

    if (form.sourceAccountId === form.destinationAccountId) {
      showError('Source and destination accounts must be different')
      return
    }

    if (Number(form.amount) <= 0) {
      showError('Transfer amount must be greater than zero')
      return
    }

    try {
      await createFundTransfer({
        sourceAccountId: form.sourceAccountId,
        destinationAccountId: form.destinationAccountId,
        amount: Number(form.amount),
        transferDate: form.transferDate,
        description: form.description || undefined,
      }).unwrap()
      showSuccess('Fund transfer created successfully')
      resetForm()
      refetch()
    } catch (error: any) {
      showError(error?.data?.message ?? error?.message ?? 'Operation failed')
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return

    try {
      await cancelFundTransfer(cancelTarget.id).unwrap()
      showSuccess(`Transfer ${cancelTarget.referenceNumber} cancelled`)
      setCancelTarget(null)
      refetch()
    } catch (error: any) {
      showError(error?.data?.message ?? error?.message ?? 'Operation failed')
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Fund Transfers"
        subtitle="Move funds between accounts and review transfer history"
        secondaryAction={{ label: 'Refresh', onClick: () => refetch() }}
        primaryAction={
          canManageTransfers
            ? { label: 'New Transfer', onClick: () => setDialogOpen(true) }
            : undefined
        }
      />

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary">
            Transfers (Current Filter)
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {transfers.length}
          </Typography>
        </CardContent>
      </Card>

      <Box sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End Date"
            type="date"
            size="small"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="CANCELLED">Cancelled</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {isLoading ? (
        <Box display="flex" justifyContent="center" mt={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Reference</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>From Account</TableCell>
                <TableCell>To Account</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    No fund transfers found
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell>{transfer.referenceNumber}</TableCell>
                    <TableCell>{formatDate(transfer.transferDate)}</TableCell>
                    <TableCell>
                      {transfer.sourceAccount.code} - {transfer.sourceAccount.name}
                    </TableCell>
                    <TableCell>
                      {transfer.destinationAccount.code} -{' '}
                      {transfer.destinationAccount.name}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(transfer.amount)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={transfer.status}
                        size="small"
                        color={
                          transfer.status === 'ACTIVE' ? 'success' : 'error'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {canManageTransfers ? (
                        <Button
                          size="small"
                          color="error"
                          startIcon={<CancelIcon />}
                          disabled={transfer.status === 'CANCELLED'}
                          onClick={() => setCancelTarget(transfer)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={dialogOpen && canManageTransfers}
        onClose={resetForm}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>New Fund Transfer</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <Autocomplete
              options={cashAccounts}
              getOptionLabel={(option) => `${option.code} - ${option.name}`}
              value={
                cashAccounts.find(
                  (account) => account.id === form.sourceAccountId,
                ) ?? null
              }
              onChange={(_event, newValue) =>
                setForm((current) => ({
                  ...current,
                  sourceAccountId: newValue?.id ?? '',
                  destinationAccountId:
                    newValue?.id === current.destinationAccountId
                      ? ''
                      : current.destinationAccountId,
                }))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="From Account *"
                  placeholder="Search accounts"
                />
              )}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              fullWidth
              size="small"
            />

            <Autocomplete
              options={availableDestinations}
              getOptionLabel={(option) => `${option.code} - ${option.name}`}
              value={
                availableDestinations.find(
                  (account) => account.id === form.destinationAccountId,
                ) ?? null
              }
              onChange={(_event, newValue) =>
                setForm((current) => ({
                  ...current,
                  destinationAccountId: newValue?.id ?? '',
                }))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="To Account *"
                  placeholder="Search accounts"
                />
              )}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              fullWidth
              size="small"
              disabled={!form.sourceAccountId}
            />

            <TextField
              fullWidth
              label="Amount *"
              type="number"
              inputProps={{ min: 0.01, step: 0.01 }}
              value={form.amount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />

            <TextField
              fullWidth
              label="Date *"
              type="date"
              value={form.transferDate}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  transferDate: event.target.value,
                }))
              }
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              fullWidth
              label="Description"
              multiline
              rows={2}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetForm}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Transfer'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Cancel Transfer</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to cancel transfer{' '}
            <strong>{cancelTarget?.referenceNumber}</strong>? This will post a
            reversing journal entry.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelTarget(null)}>Keep</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Yes, Cancel Transfer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default FundTransfersPage
