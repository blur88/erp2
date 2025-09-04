import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
} from '@mui/material'
import {
  Close as CloseIcon,
} from '@mui/icons-material'
import Calculator from './Calculator'

interface CalculatorDialogProps {
  open: boolean
  onClose: () => void
}

const CalculatorDialog: React.FC<CalculatorDialogProps> = ({ open, onClose }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: 'auto',
          maxWidth: 'none',
          backgroundColor: 'background.paper',
        },
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        pb: 1,
        px: 2,
        py: 1.5,
      }}>
        <Box />
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, pb: 2, px: 2 }}>
        <Calculator onCalculatorClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

export default CalculatorDialog