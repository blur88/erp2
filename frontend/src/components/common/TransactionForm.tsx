import React, { useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'

type EntityLabel = 'Customer' | 'Supplier'

export interface TransactionFormOption {
  id: string
  name: string
}

export interface TransactionFormColumn {
  key: string
  label: string
}

export interface TransactionFormData {
  entityId: string
  transactionDate: string
  notes: string
  items: Record<string, string | number>[]
}

/**
 * Two modes:
 *
 * 'default' — TransactionForm renders its own entity selector + date + notes + line-items table.
 *   onSubmit receives a TransactionFormData object.
 *
 * 'custom' — caller provides children as the form body (e.g. react-hook-form fields).
 *   onSubmit receives the native form submit event, matching react-hook-form's handleSubmit signature.
 *   entityOptions / lineItemColumns are ignored in this mode.
 */
type TransactionFormProps =
  | {
      mode?: 'default'
      entityLabel?: EntityLabel
      entityOptions: TransactionFormOption[]
      lineItemColumns: TransactionFormColumn[]
      onSubmit: (formData: TransactionFormData) => void | Promise<void>
      onCancel: () => void
      isSubmitting: boolean
      children?: never
      error?: React.ReactNode
      hideDefaultActions?: boolean
      submitLabel?: string
      cancelLabel?: string
    }
  | {
      mode: 'custom'
      entityLabel?: EntityLabel
      entityOptions?: TransactionFormOption[]
      lineItemColumns?: TransactionFormColumn[]
      onSubmit: (event?: React.BaseSyntheticEvent) => void | Promise<void>
      onCancel: () => void
      isSubmitting: boolean
      children: React.ReactNode
      error?: React.ReactNode
      hideDefaultActions?: boolean
      submitLabel?: string
      cancelLabel?: string
    }

const buildEmptyItem = (columns: TransactionFormColumn[]) =>
  columns.reduce<Record<string, string | number>>((item, column) => {
    item[column.key] = ''
    return item
  }, {})

const TransactionForm: React.FC<TransactionFormProps> = ({
  mode = 'default',
  entityLabel,
  entityOptions = [],
  lineItemColumns = [],
  onSubmit,
  onCancel,
  isSubmitting,
  children,
  error,
  hideDefaultActions = false,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
}) => {
  const [entityId, setEntityId] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Record<string, string | number>[]>([])

  const selectedEntity = entityOptions.find((option) => option.id === entityId) ?? null

  const total = useMemo(() => {
    return items.reduce((sum, item) => {
      const subtotal = Number(item.subtotal)
      if (!Number.isNaN(subtotal) && subtotal > 0) {
        return sum + subtotal
      }

      const totalPrice = Number(item.totalPrice)
      if (!Number.isNaN(totalPrice) && totalPrice > 0) {
        return sum + totalPrice
      }

      const quantity = Number(item.quantity)
      const unitPrice = Number(item.unitPrice)

      if (!Number.isNaN(quantity) && !Number.isNaN(unitPrice)) {
        return sum + quantity * unitPrice
      }

      return sum
    }, 0)
  }, [items])

  const handleAddLineItem = () => {
    setItems((currentItems) => [...currentItems, buildEmptyItem(lineItemColumns)])
  }

  const handleRemoveLineItem = (index: number) => {
    setItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleLineItemChange = (index: number, key: string, value: string) => {
    setItems((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
            }
          : item
      )
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (mode === 'default') {
      await (onSubmit as (formData: TransactionFormData) => void | Promise<void>)({
        entityId,
        transactionDate,
        notes,
        items,
      })
      return
    }

    await (onSubmit as (event?: React.BaseSyntheticEvent) => void | Promise<void>)(event)
  }

  return (
    <form onSubmit={handleSubmit}>
      {error}

      {mode === 'default' ? (
        <Grid container spacing={3}>
          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Transaction Information
                </Typography>
                <Grid container spacing={2}>
                  {entityLabel ? (
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Autocomplete
                        options={entityOptions}
                        getOptionLabel={(option) => option.name}
                        value={selectedEntity}
                        onChange={(_, value) => setEntityId(value?.id ?? '')}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label={entityLabel}
                            size="small"
                          />
                        )}
                      />
                    </Grid>
                  ) : null}
                  <Grid size={{ xs: 12, md: entityLabel ? 6 : 12 }}>
                    <TextField
                      label="Date"
                      type="date"
                      fullWidth
                      size="small"
                      value={transactionDate}
                      onChange={(event) => setTransactionDate(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      label="Notes"
                      fullWidth
                      multiline
                      minRows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Line Items</Typography>
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddLineItem}>
                    Add Line Item
                  </Button>
                </Box>

                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {lineItemColumns.map((column) => (
                          <TableCell key={column.key}>{column.label}</TableCell>
                        ))}
                        <TableCell align="center">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={`${index}-${lineItemColumns.length}`}>
                          {lineItemColumns.map((column) => (
                            <TableCell key={column.key}>
                              <TextField
                                fullWidth
                                size="small"
                                label={column.label}
                                value={String(item[column.key] ?? '')}
                                onChange={(event) =>
                                  handleLineItemChange(index, column.key, event.target.value)
                                }
                              />
                            </TableCell>
                          ))}
                          <TableCell align="center">
                            <IconButton
                              aria-label="Remove line item"
                              onClick={() => handleRemoveLineItem(index)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="h6">Total</Typography>
                  <Typography variant="h6">{total.toFixed(2)}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : (
        children
      )}

      {!hideDefaultActions ? (
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
          <Button variant="outlined" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {submitLabel}
          </Button>
        </Box>
      ) : null}
    </form>
  )
}

export default TransactionForm
