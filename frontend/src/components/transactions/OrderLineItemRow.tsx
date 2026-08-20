import React, { useEffect, useState } from 'react'
import {
  Autocomplete,
  Box,
  IconButton,
  MenuItem,
  TableCell,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import type { Theme } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { Controller } from 'react-hook-form'
import type { Control, FieldErrors } from 'react-hook-form'

import { formatCurrency } from '@/utils/formatters'
import { formatNum, parseNum } from './numberFormat'

/**
 * Product option shown in the row's Autocomplete. Only the fields the row and
 * its stock adornment read are declared; pages pass richer product objects.
 */
export interface OrderLineItemProduct {
  id: string
  name?: string
  stockQuantity?: number
}

/**
 * The order-line shape shared by the Sales Order and Purchase Order forms.
 * Not universal — the Stock Adjustment row has a different shape and does not
 * use this component.
 */
export interface OrderLineItem {
  productId?: string
  product?: OrderLineItemProduct
  quantity?: number
  unitPrice?: number
  discountValue?: number
  discountType?: 'percentage' | 'amount'
  totalPrice?: number
}

interface OrderLineItemRowProps {
  index: number
  control: Control<any>
  errors: FieldErrors<any>
  watchedItem: OrderLineItem | undefined
  products: OrderLineItemProduct[]
  currency: string
  theme: Theme
  isSaving: boolean
  isOnlyRow: boolean
  getKeyHandler: (row: number, col: number) => React.KeyboardEventHandler<HTMLElement>
  onProductSelect: (index: number, product: OrderLineItemProduct | null) => void
  onRemove: () => void
  loadProducts: (search?: string) => void
  renderProductAdornment?: (watchedItem: OrderLineItem | undefined) => React.ReactNode
}

export default function OrderLineItemRow({
  index,
  control,
  errors,
  watchedItem,
  products,
  currency,
  theme,
  isSaving,
  isOnlyRow,
  getKeyHandler,
  onProductSelect,
  onRemove,
  loadProducts,
  renderProductAdornment,
}: OrderLineItemRowProps) {
  const [qtyDisplay, setQtyDisplay] = useState(String(watchedItem?.quantity ?? 1))
  const [priceDisplay, setPriceDisplay] = useState(formatNum(watchedItem?.unitPrice ?? 0))
  const [discountDisplay, setDiscountDisplay] = useState(formatNum(watchedItem?.discountValue ?? 0))
  const [qtyFocused, setQtyFocused] = useState(false)
  const [priceFocused, setPriceFocused] = useState(false)
  const [discountFocused, setDiscountFocused] = useState(false)

  useEffect(() => {
    if (!qtyFocused) setQtyDisplay(String(watchedItem?.quantity ?? 1))
  }, [qtyFocused, watchedItem?.quantity])

  useEffect(() => {
    if (!priceFocused) setPriceDisplay(formatNum(watchedItem?.unitPrice ?? 0))
  }, [priceFocused, watchedItem?.unitPrice])

  useEffect(() => {
    if (!discountFocused) setDiscountDisplay(formatNum(watchedItem?.discountValue ?? 0))
  }, [discountFocused, watchedItem?.discountValue])

  return (
    <TableRow>
      <TableCell sx={{ padding: '2px !important' }} data-cell={`r${index}-c0`}>
        <Controller
          name={`items.${index}.productId`}
          control={control}
          render={({ field }) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Autocomplete
                options={products}
                getOptionLabel={(option) => option?.name || ''}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={watchedItem?.product || products.find((p) => p.id === field.value) || null}
                onChange={(_, value) => onProductSelect(index, value)}
                onInputChange={(_, value, reason) => {
                  if (reason === 'input') loadProducts(value.trim().length >= 1 ? value : '')
                }}
                filterOptions={(options) => options}
                size="small"
                disabled={isSaving}
                onKeyDown={getKeyHandler(index, 0)}
                sx={{ flex: 1 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Search by name or barcode..."
                    variant="outlined"
                    error={!!errors.items?.[index]?.productId}
                    helperText={errors.items?.[index]?.productId?.message}
                    sx={{
                      '& .MuiInputBase-input': {
                        textAlign: 'left !important',
                        padding: '2px 8px !important',
                        fontSize: '0.875rem',
                      },
                    }}
                  />
                )}
                slotProps={{
                  paper: { sx: { '& .MuiAutocomplete-option': { fontSize: '0.875rem' } } },
                }}
              />
              {renderProductAdornment?.(watchedItem)}
            </Box>
          )}
        />
      </TableCell>

      <TableCell sx={{ padding: '2px !important' }} data-cell={`r${index}-c1`}>
        <Controller
          name={`items.${index}.quantity`}
          control={control}
          render={({ field }) => (
            <TextField
              value={qtyFocused ? qtyDisplay : String(field.value ?? '')}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '')
                setQtyDisplay(v)
                field.onChange(parseInt(v) || 0)
              }}
              onFocus={() => {
                setQtyFocused(true)
                setQtyDisplay(String(field.value ?? ''))
              }}
              onBlur={() => {
                setQtyFocused(false)
                setQtyDisplay(String(field.value ?? ''))
              }}
              onKeyDown={getKeyHandler(index, 1)}
              variant="outlined"
              disabled={isSaving}
              error={!!errors.items?.[index]?.quantity}
              slotProps={{
                htmlInput: {
                  style: { textAlign: 'center', fontSize: '0.875rem' },
                  inputMode: 'numeric',
                },
              }}
            />
          )}
        />
      </TableCell>

      <TableCell sx={{ padding: '2px !important' }} data-cell={`r${index}-c2`}>
        <Controller
          name={`items.${index}.unitPrice`}
          control={control}
          render={({ field }) => (
            <TextField
              value={priceFocused ? priceDisplay : formatNum(field.value)}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                setPriceDisplay(v)
                field.onChange(parseNum(v))
              }}
              onFocus={() => {
                setPriceFocused(true)
                setPriceDisplay(String(field.value ?? ''))
              }}
              onBlur={() => {
                setPriceFocused(false)
                if (!priceDisplay || priceDisplay === '.') field.onChange(0)
              }}
              onKeyDown={getKeyHandler(index, 2)}
              variant="outlined"
              disabled={isSaving}
              error={!!errors.items?.[index]?.unitPrice}
              slotProps={{
                input: {
                  startAdornment: (
                    <span
                      style={{
                        marginRight: 4,
                        fontSize: '0.75rem',
                        color: theme.palette.text.secondary,
                      }}
                    >
                      {currency}
                    </span>
                  ),
                },
                htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } },
              }}
            />
          )}
        />
      </TableCell>

      <TableCell sx={{ padding: '2px !important' }} data-cell={`r${index}-c3`}>
        <Box sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          <Controller
            name={`items.${index}.discountValue`}
            control={control}
            render={({ field }) => (
              <TextField
                value={discountFocused ? discountDisplay : formatNum(field.value)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  setDiscountDisplay(v)
                  field.onChange(parseNum(v))
                }}
                onFocus={() => {
                  setDiscountFocused(true)
                  setDiscountDisplay(String(field.value ?? ''))
                }}
                onBlur={() => {
                  setDiscountFocused(false)
                  if (!discountDisplay || discountDisplay === '.') field.onChange(0)
                }}
                onKeyDown={getKeyHandler(index, 3)}
                variant="outlined"
                disabled={isSaving}
                error={!!errors.items?.[index]?.discountValue}
                sx={{ flex: 1 }}
                slotProps={{
                  htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } },
                }}
              />
            )}
          />
          <Controller
            name={`items.${index}.discountType`}
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                variant="outlined"
                disabled={isSaving}
                sx={{
                  width: '60px',
                  '& .MuiInputBase-input': { padding: '2px 4px' },
                }}
              >
                <MenuItem value="percentage">%</MenuItem>
                <MenuItem value="amount">{currency}</MenuItem>
              </TextField>
            )}
          />
        </Box>
      </TableCell>

      <TableCell align="right" sx={{ padding: '2px 8px !important' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatCurrency(watchedItem?.totalPrice || 0)}
        </Typography>
      </TableCell>

      <TableCell align="center" sx={{ padding: '2px !important' }}>
        <IconButton
          size="small"
          onClick={onRemove}
          disabled={isOnlyRow || isSaving}
          sx={{
            color: theme.palette.error.main,
            '&.Mui-disabled': { color: theme.palette.action.disabled },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>

      <TableCell sx={{ padding: '2px !important' }}>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {index + 1}
        </Typography>
      </TableCell>
    </TableRow>
  )
}
