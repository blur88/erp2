import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Alert,
  AlertTitle,
  Link,
  Typography,
} from '@mui/material'
import { default as AccountBalanceIcon } from '@mui/icons-material/AccountBalance'

interface AccountingEntryLinkProps {
  sourceType: string
  sourceId: string
  variant?: 'button' | 'alert' | 'inline' | 'table-row'
  label?: string
  message?: string
}

const AccountingEntryLink: React.FC<AccountingEntryLinkProps> = ({
  sourceType,
  sourceId,
  variant = 'button',
  label = 'View Journal Entry',
  message = 'This transaction has been posted to the accounting system.',
}) => {
  const navigate = useNavigate()

  const handleClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    navigate(`/accounting/journal-entries?sourceType=${sourceType}&sourceId=${sourceId}`)
  }

  if (variant === 'alert') {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        <AlertTitle>Accounting Information</AlertTitle>
        {message}
        <Button variant="text" size="small" sx={{ ml: 2 }} onClick={handleClick}>
          {label}
        </Button>
      </Alert>
    )
  }

  if (variant === 'inline') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AccountBalanceIcon fontSize="small" color="action" />
        <Link
          component="button"
          variant="body2"
          onClick={handleClick}
          sx={{
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
            },
          }}
        >
          {label}
        </Link>
      </Box>
    )
  }

  if (variant === 'table-row') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 0.75,
          px: 1,
        }}
      >
        <Typography
          sx={{
            fontWeight: 600,
            color: 'text.secondary',
            fontSize: '0.8rem',
            width: '40%',
          }}
        >
          Accounting Entry
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountBalanceIcon fontSize="small" color="primary" sx={{ fontSize: '1rem' }} />
          <Link
            component="button"
            variant="body2"
            onClick={handleClick}
            sx={{
              fontSize: '0.8rem',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {label}
          </Link>
        </Box>
      </Box>
    )
  }

  // Default: button variant
  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={<AccountBalanceIcon />}
      onClick={handleClick}
    >
      {label}
    </Button>
  )
}

export default AccountingEntryLink
