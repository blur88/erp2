import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  useTheme,
  alpha,
  Slide,
  Backdrop,
} from '@mui/material'
import {
  Close as CloseIcon,
  Calculate as CalculateIcon,
} from '@mui/icons-material'
import Calculator from './Calculator'

const Transition = React.forwardRef(function Transition(props: any, ref: React.Ref<unknown>) {
  return <Slide direction="up" ref={ref} {...props} />
})

interface CalculatorDialogProps {
  open: boolean
  onClose: () => void
}

const CalculatorDialog: React.FC<CalculatorDialogProps> = ({ open, onClose }) => {
  const theme = useTheme()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      TransitionComponent={Transition}
      keepMounted={false}
      slots={{
        backdrop: Backdrop,
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: alpha(theme.palette.grey[900], 0.75),
            backdropFilter: 'blur(4px)',
          }
        }
      }}
      PaperProps={{
        sx: {
          width: 'auto',
          maxWidth: 'none',
          borderRadius: '24px',
          background: 'transparent',
          boxShadow: 'none',
          overflow: 'visible',
        },
      }}
      sx={{
        '& .MuiDialog-container': {
          alignItems: 'flex-start',
          paddingTop: '10vh',
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        pb: 0,
        px: 0,
        py: 0,
        position: 'relative',
        background: 'transparent',
      }}>
        <Box sx={{
          position: 'absolute',
          top: -16,
          right: -8,
          zIndex: 1,
        }}>
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              backgroundColor: alpha(theme.palette.background.paper, 0.9),
              backdropFilter: 'blur(8px)',
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              '&:hover': {
                backgroundColor: alpha(theme.palette.error.main, 0.1),
                borderColor: alpha(theme.palette.error.main, 0.3),
                color: theme.palette.error.main,
                transform: 'scale(1.05)',
              },
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Calculator onCalculatorClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

export default CalculatorDialog