import { useState, type MouseEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

import { useLazyGetStockAdjustmentQuery } from '@/store/api/inventoryApi'
import { formatNumber } from '@/utils/formatters'
import type { StockAdjustment } from '@/types'

interface Props {
  adjustment: StockAdjustment
}

export default function StockAdjustmentItemsPopover({ adjustment }: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [trigger, { data, isFetching, isError, isUninitialized }] = useLazyGetStockAdjustmentQuery()

  const count = adjustment.itemCount
  const label = count === 1 ? '1 item' : `${formatNumber(count)} items`

  if (count === 0) {
    return <span>{formatNumber(count)}</span>
  }

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setAnchorEl(event.currentTarget)
    trigger(adjustment.id, true)
  }

  const handleClose = () => setAnchorEl(null)

  const handleRetry = () => trigger(adjustment.id, true)

  const items = data?.items ?? []
  // Show the spinner until the first fetch settles: before the initial trigger
  // resolves, isFetching can briefly be false, which would otherwise flash an
  // empty product list.
  const isLoading = isFetching || isUninitialized

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <span>{label}</span>
      <IconButton
        size="small"
        aria-label="Show products"
        onClick={handleOpen}
      >
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        // Stop the dismiss/backdrop click from bubbling to the row's onClick
        // (which navigates to the View page). Mirrors RowActionMenu.
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ p: 2, minWidth: 220 }}>
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
              <CircularProgress size={20} />
            </Box>
          )}
          {isError && !isLoading && (
            <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Typography variant="body2" color="error">
                Failed to load products.
              </Typography>
              <Button size="small" onClick={handleRetry}>Retry</Button>
            </Stack>
          )}
          {!isLoading && !isError && (
            <>
              <Stack spacing={0.5}>
                {items.map((item) => (
                  <Box
                    key={item.id}
                    sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
                  >
                    <Typography variant="body2">{item.product.name}</Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color:
                          item.difference > 0
                            ? 'success.main'
                            : item.difference < 0
                              ? 'error.main'
                              : 'text.secondary',
                        fontWeight: 600,
                      }}
                    >
                      {item.difference > 0 ? '+' : ''}{formatNumber(item.difference)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Total: {label}
              </Typography>
            </>
          )}
        </Box>
      </Popover>
    </Box>
  )
}
