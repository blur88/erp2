import React, { useEffect } from 'react'
import { Box, Divider, InputBase, Modal, Typography } from '@mui/material'
import { ManageSearch as ManageSearchIcon, Search as SearchIcon } from '@mui/icons-material'

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

const SearchModal: React.FC<SearchModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <Modal open={open} onClose={onClose} aria-label="Global search">
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, 0)',
          width: 560,
          maxWidth: '90vw',
          bgcolor: '#1E1E1E',
          border: '1px solid #2A2A2A',
          borderRadius: '12px',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.5,
            bgcolor: '#232323',
          }}
        >
          <SearchIcon sx={{ color: '#6B7280', fontSize: 20, flexShrink: 0 }} />
          <InputBase
            autoFocus
            placeholder="Search across the ERP..."
            fullWidth
            sx={{
              color: '#E0E0E0',
              fontSize: '0.9375rem',
              '& input::placeholder': { color: '#6B7280' },
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: '#6B7280', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Esc to close
          </Typography>
        </Box>

        <Divider sx={{ bgcolor: '#2A2A2A' }} />

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            py: 5,
            px: 3,
          }}
        >
          <ManageSearchIcon sx={{ fontSize: 48, color: '#3A3A3A' }} />
          <Typography variant="h6" sx={{ color: '#E0E0E0', fontWeight: 600 }}>
            Global Search Coming Soon
          </Typography>
          <Typography variant="body2" sx={{ color: '#A0A0A0', textAlign: 'center' }}>
            Will search across Pages, Customers, Products, and Transactions
          </Typography>
        </Box>

        <Divider sx={{ bgcolor: '#2A2A2A' }} />

        <Box sx={{ px: 2, py: 1.5, textAlign: 'center' }}>
          <Typography component="div" sx={{ color: '#6B7280', fontSize: '12px' }}>
            Tip: Press{' '}
            <Box
              component="kbd"
              sx={{
                bgcolor: '#232323',
                border: '1px solid #3A3A3A',
                borderRadius: '4px',
                px: 0.75,
                py: 0.25,
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#A0A0A0',
              }}
            >
              Ctrl+K
            </Box>{' '}
            to open search anytime
          </Typography>
        </Box>
      </Box>
    </Modal>
  )
}

export default SearchModal
