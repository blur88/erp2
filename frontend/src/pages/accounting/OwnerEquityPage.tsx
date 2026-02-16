import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Chip,
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
  Checkbox,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PostAdd as PostIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import {
  bulkDeleteOwnerEquity,
  bulkPostOwnerEquity,
  createOwnerEquity,
  deleteOwnerEquity,
  fetchOwnerEquity,
  postOwnerEquity,
  selectOwnerEquity,
  selectOwnerEquityLoading,
  updateOwnerEquity,
} from '@/store/slices/ownerEquitySlice'
import {
  fetchPaymentMethods,
  selectPaymentMethods,
} from '@/store/slices/paymentMethodsSlice'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import type { OwnerEquityTransaction } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

const typeLabel: Record<OwnerEquityTransaction['type'], string> = {
  capital_injection: 'Capital Injection',
  owner_drawing: 'Owner Drawing',
}

type FormState = {
  id?: string
  transactionDate: string
  type: 'capital_injection' | 'owner_drawing'
  amount: string
  paymentMethodId: string
  description: string
}

const OwnerEquityPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { showError, showSuccess } = useNotification()
  const rows = useAppSelector(selectOwnerEquity)
  const loading = useAppSelector(selectOwnerEquityLoading)
  const paymentMethods = useAppSelector(selectPaymentMethods)

  const searchRef = useRef<HTMLInputElement | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>({
    transactionDate: new Date().toISOString().slice(0, 10),
    type: 'capital_injection',
    amount: '',
    paymentMethodId: '',
    description: '',
  })

  const load = () => {
    dispatch(
      fetchOwnerEquity({
        page: 1,
        limit: 100,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    )
  }

  useEffect(() => {
    load()
  }, [dispatch, typeFilter, statusFilter, startDate, endDate])

  useEffect(() => {
    dispatch(fetchPaymentMethods({ page: 1, limit: 200, isActive: true }))
  }, [dispatch])

  const filteredRows = useMemo(() => {
    if (!search) return rows
    const term = search.toLowerCase()
    return rows.filter((r) =>
      [r.referenceNumber, r.description, r.paymentMethod?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [rows, search])

  const draftRows = filteredRows.filter((r) => r.status === 'draft')
  const allSelected = draftRows.length > 0 && selectedIds.size === draftRows.length

  const resetDialog = () => {
    setDialogOpen(false)
    setForm({
      transactionDate: new Date().toISOString().slice(0, 10),
      type: 'capital_injection',
      amount: '',
      paymentMethodId: '',
      description: '',
    })
  }

  const openCreate = () => {
    setForm({
      transactionDate: new Date().toISOString().slice(0, 10),
      type: 'capital_injection',
      amount: '',
      paymentMethodId: paymentMethods[0]?.id || '',
      description: '',
    })
    setDialogOpen(true)
  }

  const openEdit = (row: OwnerEquityTransaction) => {
    setForm({
      id: row.id,
      transactionDate: row.transactionDate.slice(0, 10),
      type: row.type,
      amount: String(row.amount),
      paymentMethodId: row.paymentMethodId,
      description: row.description || '',
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.paymentMethodId || !form.amount || Number(form.amount) <= 0) {
      showError('Please enter valid amount and payment method')
      return
    }

    const payload = {
      transactionDate: form.transactionDate,
      type: form.type,
      amount: Number(form.amount),
      paymentMethodId: form.paymentMethodId,
      description: form.description || undefined,
    }

    try {
      if (form.id) {
        await dispatch(updateOwnerEquity({ id: form.id, data: payload })).unwrap()
        showSuccess('Transaction updated')
      } else {
        await dispatch(createOwnerEquity(payload)).unwrap()
        showSuccess('Transaction created')
      }
      resetDialog()
      load()
    } catch (error: any) {
      showError(String(error))
    }
  }

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this draft transaction?')) return
    try {
      await dispatch(deleteOwnerEquity(id)).unwrap()
      showSuccess('Transaction deleted')
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      load()
    } catch (error: any) {
      showError(String(error))
    }
  }

  const onPost = async (id: string) => {
    if (!window.confirm('Post this transaction?')) return
    try {
      await dispatch(postOwnerEquity(id)).unwrap()
      showSuccess('Transaction posted')
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      load()
    } catch (error: any) {
      showError(String(error))
    }
  }

  const onBulkPost = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !window.confirm(`Post ${ids.length} selected transactions?`)) return
    try {
      await dispatch(bulkPostOwnerEquity(ids)).unwrap()
      showSuccess('Bulk post completed')
      setSelectedIds(new Set())
      load()
    } catch (error: any) {
      showError(String(error))
    }
  }

  const onBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected transactions?`)) return
    try {
      await dispatch(bulkDeleteOwnerEquity(ids)).unwrap()
      showSuccess('Bulk delete completed')
      setSelectedIds(new Set())
      load()
    } catch (error: any) {
      showError(String(error))
    }
  }

  useKeyboardShortcuts({
    onSearch: () => searchRef.current?.focus(),
    onAdd: openCreate,
    onRefresh: load,
    onEscape: () => {
      setSelectedIds(new Set())
      setDialogOpen(false)
    },
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Owner's Equity Transactions</Typography>
        <Stack direction="row" spacing={1}>
          {selectedIds.size > 0 && (
            <>
              <Button variant="contained" startIcon={<PostIcon />} onClick={onBulkPost}>
                Bulk Post ({selectedIds.size})
              </Button>
              <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={onBulkDelete}>
                Bulk Delete ({selectedIds.size})
              </Button>
            </>
          )}
          <IconButton onClick={load}>
            <RefreshIcon />
          </IconButton>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New Transaction
          </Button>
        </Stack>
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            inputRef={searchRef}
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Type</InputLabel>
            <Select value={typeFilter} label="Type" onChange={(e) => setTypeFilter(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="capital_injection">Capital Injection</MenuItem>
              <MenuItem value="owner_drawing">Owner Drawing</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="posted">Posted</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Start Date" type="date" size="small" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField label="End Date" type="date" size="small" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Stack>
      </Paper>

      <Paper>
        <TableContainer>
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
                <TableCell>Type</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Payment Method</TableCell>
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
                    <TableCell>{formatDate(row.transactionDate)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={typeLabel[row.type]}
                        color={row.type === 'capital_injection' ? 'primary' : 'warning'}
                      />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(Number(row.amount || 0))}</TableCell>
                    <TableCell>{row.paymentMethod?.name || '-'}</TableCell>
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
                  <TableCell colSpan={9}>
                    <Typography color="text.secondary">No owner equity transactions found.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select value={form.type} label="Type" onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FormState['type'] }))}>
                <MenuItem value="capital_injection">Capital Injection</MenuItem>
                <MenuItem value="owner_drawing">Owner Drawing</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Date" type="date" size="small" value={form.transactionDate} onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Amount" size="small" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            <FormControl fullWidth size="small">
              <InputLabel>Payment Method</InputLabel>
              <Select value={form.paymentMethodId} label="Payment Method" onChange={(e) => setForm((f) => ({ ...f, paymentMethodId: e.target.value }))}>
                {paymentMethods.map((pm) => (
                  <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default OwnerEquityPage
