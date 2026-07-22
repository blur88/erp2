import type { ReactElement } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Button, Link, Tooltip } from '@mui/material'

import type { AccountingSourceType } from '@/types'
import { buildSourceLink } from '../source-link'

const TYPE_LABELS: Record<AccountingSourceType, string> = {
  SALES_ORDER: 'Sales Order',
  PURCHASE_ORDER: 'Purchase Order',
  STOCK_ADJUSTMENT: 'Stock Adjustment',
  OPENING_BALANCE: 'Opening Balance',
}

export default function SourceLink({
  sourceType,
  sourceDocumentId,
  sourceRef,
  variant = 'text',
}: {
  sourceType: AccountingSourceType
  sourceDocumentId: string | null
  sourceRef: string | null
  variant?: 'text' | 'button'
}) {
  const typeLabel = TYPE_LABELS[sourceType]
  const href = buildSourceLink(sourceType, sourceDocumentId, sourceRef)
  const primaryText = sourceRef || typeLabel

  let inner: ReactElement
  if (href) {
    inner =
      variant === 'button' ? (
        <Button
          component={RouterLink}
          to={href}
          variant="text"
          size="small"
          sx={{ textTransform: 'none' }}
        >
          {primaryText}
        </Button>
      ) : (
        <Link component={RouterLink} to={href} underline="hover">
          {primaryText}
        </Link>
      )
  } else if (sourceRef) {
    // Ref present but not linkable: focusable so the tooltip is keyboard-reachable.
    inner = <span tabIndex={0}>{primaryText}</span>
  } else {
    // Type-label fallback: no tooltip, so no tab stop.
    inner = <span>{primaryText}</span>
  }

  // Tooltip only when a ref is present; describeChild keeps the accessible NAME as the ref
  // and exposes the type as the accessible DESCRIPTION.
  return sourceRef ? (
    <Tooltip title={typeLabel} describeChild>
      {inner}
    </Tooltip>
  ) : (
    inner
  )
}
