import React, { useEffect } from 'react'
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  FormHelperText,
  Chip,
  Box,
} from '@mui/material'
import { default as StarIcon } from '@mui/icons-material/Star'
import { useGetEffectivePriceListsQuery, useGetPriceListsQuery } from '@/store/api/priceListApi'
import type { PriceList } from '@/types'
import type { SxProps, Theme } from '@mui/material/styles'

interface PriceListSelectorProps {
  value?: string | null
  onChange: (value: string) => void
  error?: string
  label?: string
  required?: boolean
  disabled?: boolean
  fullWidth?: boolean
  showInactive?: boolean
  size?: 'small' | 'medium'
  sx?: SxProps<Theme>
}

const PriceListSelector: React.FC<PriceListSelectorProps> = ({
  value,
  onChange,
  error,
  label = 'Price List',
  required = false,
  disabled = false,
  fullWidth = true,
  showInactive = false,
  size,
  sx,
}) => {
  const { data: effectivePriceLists = [], isLoading: effectiveLoading } = useGetEffectivePriceListsQuery()
  const { data: allPriceLists } = useGetPriceListsQuery({ page: 1, limit: 200, isActive: undefined })
  const defaultPriceList = allPriceLists?.data?.find((pl) => pl.isDefault) ?? null

  // Filter price lists based on showInactive prop
  const filteredPriceLists = showInactive
    ? effectivePriceLists
    : effectivePriceLists.filter((pl) => pl.isActive)

  // If no value is set and we have a default price list, set it
  useEffect(() => {
    if (!value && defaultPriceList && filteredPriceLists.length > 0) {
      onChange(defaultPriceList.id)
    }
  }, [value, defaultPriceList, filteredPriceLists, onChange])

  const renderPriceListOption = (priceList: PriceList) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {priceList.isDefault && (
        <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
      )}
      <Box>
        <Box component="span" sx={{ fontWeight: priceList.isDefault ? 600 : 400 }}>
          {priceList.name}
        </Box>
        <Box component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
          ({priceList.code})
        </Box>
      </Box>
      {!priceList.isActive && (
        <Chip
          label="Inactive"
          size="small"
          color="default"
          sx={{ ml: 'auto', height: 20 }}
        />
      )}
    </Box>
  )

  return (
    <FormControl fullWidth={fullWidth} error={!!error} disabled={disabled || effectiveLoading} size={size} sx={sx}>
      <InputLabel id="price-list-selector-label" required={required}>
        {label}
      </InputLabel>
      <Select
        labelId="price-list-selector-label"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        disabled={disabled || effectiveLoading}
        endAdornment={
          effectiveLoading ? (
            <CircularProgress size={20} sx={{ mr: 2 }} />
          ) : null
        }
      >
        {filteredPriceLists.length === 0 && !effectiveLoading && (
          <MenuItem disabled>
            <em>No price lists available</em>
          </MenuItem>
        )}
        {filteredPriceLists.map((priceList) => (
          <MenuItem key={priceList.id} value={priceList.id}>
            {renderPriceListOption(priceList)}
          </MenuItem>
        ))}
      </Select>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  )
}

export default PriceListSelector
