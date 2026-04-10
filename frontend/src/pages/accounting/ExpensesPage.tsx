import React, { useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
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
import { default as AddIcon } from '@mui/icons-material/Add'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import { default as SearchIcon } from '@mui/icons-material/Search'
import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import {
  useBulkDeleteExpensesMutation,
  useBulkPostExpensesMutation,
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useGetChartOfAccountsQuery,
  useGetExpensesQuery,
  useGetPaymentMethodsQuery,
  usePostExpenseMutation,
  useUpdateExpenseMutation,
} from '@/store/api/accountingApi'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import type { ChartOfAccount, ExpenseRecord } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

type FormState = {
  id?: string
  expenseDate: string
  expenseAccountId: string
  amount: string
  paymentMethodId: string
  vendor: string
  description: string
}

const ExpensesPage: React.FC = () => {
  const { showError, showSuccess } = useNotification()
  const searchRef = useRef<HTMLInputElement | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [accountFilter, setAccountFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>({
    expenseDate: new Date().toISOString().slice(0, 10),
    expenseAccountId: '',
    amount: '',
    paymentMethodId: '',
    vendor: '',
    description: '',
  })
  const filters = useMemo(
    () => ({
      page: 1,
      expenseAccountId: accountFilter || undefined,
      paymentMethodId: paymentFilter || undefined,
      status: statusFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: search || undefined,
    }),
    [accountFilter, paymentFilter, statusFilter, startDate, endDate, search],
  )
  const { data: expensesResponse, isLoading: loading, refetch } = useGetExpensesQuery(filters)
  const rows = expensesResponse?.data ?? []
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ page: 1, isActive: true })
  const paymentMethods = paymentMethodsResponse?.data ?? []
  const { data: expenseAccountsResponse } = useGetChartOfAccountsQuery({
    page: 1,
    type: 'EXPENSE',
    isActive: true,
  })
  const expenseAccounts = (expenseAccountsResponse?.data ?? []) as ChartOfAccount[]
  const [createExpense] = useCreateExpenseMutation()
  const [updateExpense] = useUpdateExpenseMutation()
  const [deleteExpense] = useDeleteExpenseMutation()
  const [postExpense] = usePostExpenseMutation()
  const [bulkPostExpenses] = useBulkPostExpensesMutation()
  const [bulkDeleteExpenses] = useBulkDeleteExpensesMutation()

  const filteredRows = useMemo(() => {
    if (!search) return rows
    const term = search.toLowerCase()
    return rows.filter((r) =>
      [r.referenceNumber, r.vendor, r.description, r.expenseAccount?.name, r.paymentMethod?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [rows, search])

  const totalExpenses = useMemo(
    () => filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [filteredRows],
  )

  const draftRows = filteredRows.filter((r) => r.status === 'draft')
  const allSelected = draftRows.length > 0 && selectedIds.size === draftRows.length

  const resetDialog = () => {
    setDialogOpen(false)
    setForm({
      expenseDate: new Date().toISOString().slice(0, 10),
      expenseAccountId: '',
      amount: '',
      paymentMethodId: '',
      vendor: '',
      description: '',
    })
  }

  const openCreate = () => {
    setForm({
      expenseDate: new Date().toISOString().slice(0, 10),
      expenseAccountId: expenseAccounts[0]?.id || '',
      amount: '',
      paymentMethodId: paymentMethods[0]?.id || '',
      vendor: '',
      description: '',
    })
    setDialogOpen(true)
  }

  const openEdit = (row: ExpenseRecord) => {
    setForm({
      id: row.id,
      expenseDate: row.expenseDate.slice(0, 10),
      expenseAccountId: row.expenseAccountId,
      amount: String(row.amount),
      paymentMethodId: row.paymentMethodId,
      vendor: row.vendor || '',
      description: row.description || '',
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.expenseAccountId || !form.paymentMethodId || !form.amount || Number(form.amount) <= 0) {
      showError('Please enter valid data')
      return
    }

    const payload = {
      expenseDate: form.expenseDate,
      expenseAccountId: form.expenseAccountId,
      amount: Number(form.amount),
      paymentMethodId: form.paymentMethodId,
      vendor: form.vendor || undefined,
      description: form.description || undefined,
    }

    try {
      if (form.id) {
        await updateExpense({ id: form.id, data: payload }).unwrap()
        showSuccess('Expense updated')
      } else {
        await createExpense(payload).unwrap()
        showSuccess('Expense created')
      }
      resetDialog()
      refetch()
    } catch (error: any) {
      showError(String(error))
    }
  }

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this draft expense?')) return
    try {
      await deleteExpense(id).unwrap()
      showSuccess('Expense deleted')
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      refetch()
    } catch (error: any) {
      showError(String(error))
    }
  }

  const onPost = async (id: string) => {
    if (!window.confirm('Post this expense?')) return
    try {
      await postExpense(id).unwrap()
      showSuccess('Expense posted')
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      refetch()
    } catch (error: any) {
      showError(String(error))
    }
  }

  const onBulkPost = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !window.confirm(`Post ${ids.length} selected expenses?`)) return
    try {
      await bulkPostExpenses(ids).unwrap()
      showSuccess('Bulk post completed')
      setSelectedIds(new Set())
      refetch()
    } catch (error: any) {
      showError(String(error))
    }
  }

  const onBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected expenses?`)) return
    try {
      await bulkDeleteExpenses(ids).unwrap()
      showSuccess('Bulk delete completed')
      setSelectedIds(new Set())
      refetch()
    } catch (error: any) {
      showError(String(error))
    }
  }

  useKeyboardShortcuts({
    onSearch: () => searchRef.current?.focus(),
    onAdd: openCreate,
    onRefresh: refetch,
    onEscape: () => {
      setSelectedIds(new Set())
      setDialogOpen(false)
    },
  })

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Record and manage business expense transactions"
        primaryAction={{ label: 'New Expense', onClick: openCreate }}
      />
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{
            color: "text.secondary"
          }}>Total Expenses (Current Filter)</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{formatCurrency(totalExpenses)}</Typography>
        </CardContent>
      </Card>
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{
          alignItems: "flex-start"
        }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ flex: 1, flexWrap: 'wrap' }}>
          <TextField
            inputRef={searchRef}
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Expense Account</InputLabel>
            <Select value={accountFilter} label="Expense Account" onChange={(e) => setAccountFilter(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {expenseAccounts.map((a) => (
                <MenuItem key={a.id} value={a.id}>{a.code} - {a.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Payment Method</InputLabel>
            <Select value={paymentFilter} label="Payment Method" onChange={(e) => setPaymentFilter(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {paymentMethods.map((pm) => (
                <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="posted">Posted</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Start Date" type="date" size="small" value={startDate} onChange={(e) => setStartDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="End Date" type="date" size="small" value={endDate} onChange={(e) => setEndDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          <IconButton onClick={() => refetch()} size="small" sx={{ mt: 0.5 }}>
            <RefreshIcon />
          </IconButton>
        </Stack>
      </Box>
      {selectedIds.size > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5, bgcolor: 'action.selected', borderRadius: 1 }}>
          <Button variant="contained" size="small" startIcon={<PostIcon />} onClick={onBulkPost}>
            Bulk Post ({selectedIds.size})
          </Button>
          <Button variant="outlined" size="small" color="error" startIcon={<DeleteIcon />} onClick={onBulkDelete}>
            Bulk Delete ({selectedIds.size})
          </Button>
        </Box>
      )}
      <Paper>
        <TableContainer>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={!allSelected && selectedIds.size > 0}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedIds(new Set())
                        return
                      }
                      setSelectedIds(new Set(draftRows.map((r) => r.id)))
                    }}
                  />
                </TableCell>
                <TableCell>Reference #</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Expense Account</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Payment Method</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((row) => {
                const isDraft = row.status === 'draft'
                return (
                  <TableRow key={row.id}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        disabled={!isDraft}
                        checked={selectedIds.has(row.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(row.id)) next.delete(row.id)
                            else next.add(row.id)
                            return next
                          })
                        }}
                      />
                    </TableCell>
                    <TableCell>{row.referenceNumber}</TableCell>
                    <TableCell>{formatDate(row.expenseDate)}</TableCell>
                    <TableCell>{row.expenseAccount ? `${row.expenseAccount.code} - ${row.expenseAccount.name}` : '-'}</TableCell>
                    <TableCell align="right">{formatCurrency(Number(row.amount || 0))}</TableCell>
                    <TableCell>{row.paymentMethod?.name || '-'}</TableCell>
                    <TableCell>{row.vendor || '-'}</TableCell>
                    <TableCell>{row.description || '-'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={row.status} color={row.status === 'posted' ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell align="right">
                      {isDraft && (
                        <>
                          <IconButton size="small" onClick={() => openEdit(row)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => onPost(row.id)}>
                            <PostIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => onDelete(row.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {!filteredRows.length && !loading && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Typography sx={{
                      color: "text.secondary"
                    }}>No expenses found.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Dialog open={dialogOpen} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? 'Edit Expense' : 'New Expense'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Date" type="date" size="small" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            <FormControl fullWidth size="small">
              <InputLabel>Expense Account</InputLabel>
              <Select value={form.expenseAccountId} label="Expense Account" onChange={(e) => setForm((f) => ({ ...f, expenseAccountId: e.target.value }))}>
                {expenseAccounts.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.code} - {a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Amount" size="small" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            <FormControl fullWidth size="small">
              <InputLabel>Payment Method</InputLabel>
              <Select value={form.paymentMethodId} label="Payment Method" onChange={(e) => setForm((f) => ({ ...f, paymentMethodId: e.target.value }))}>
                {paymentMethods.map((pm) => (
                  <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Vendor" value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
            <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ExpensesPage
