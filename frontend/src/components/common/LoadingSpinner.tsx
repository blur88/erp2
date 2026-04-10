import React from 'react'
import {
  Box,
  CircularProgress,
  Typography,
  Backdrop,
  Paper,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'

interface LoadingSpinnerProps {
  message?: string
  size?: number | string
  backdrop?: boolean
  overlay?: boolean
  fullScreen?: boolean
  sx?: any
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  size = 40,
  backdrop = false,
  overlay = false,
  fullScreen = false,
  sx = {},
}) => {
  const theme = useTheme()

  const content = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        ...sx,
      }}
    >
      <CircularProgress size={size} />
      {message && (
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            textAlign: 'center'
          }}>
          {message}
        </Typography>
      )}
    </Box>
  )

  if (backdrop) {
    return (
      <Backdrop
        open
        sx={{
          color: theme.palette.text.primary,
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        {content}
      </Backdrop>
    )
  }

  if (overlay) {
    return (
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: alpha(theme.palette.common.white, 0.8),
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        {content}
      </Box>
    )
  }

  if (fullScreen) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}
      >
        {content}
      </Box>
    )
  }

  return content
}

// Skeleton loading component for cards
const SkeletonCard: React.FC<{ height?: number | string }> = ({ height = 200 }) => (
  <Paper
    sx={{
      height,
      p: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
    }}
  >
    <Box
      sx={{
        height: 20,
        bgcolor: 'grey.200',
        borderRadius: 1,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
    <Box
      sx={{
        height: 16,
        bgcolor: 'grey.200',
        borderRadius: 1,
        width: '60%',
        animation: 'pulse 1.5s ease-in-out infinite',
        animationDelay: '0.1s',
      }}
    />
    <Box
      sx={{
        flexGrow: 1,
        bgcolor: 'grey.200',
        borderRadius: 1,
        mt: 1,
        animation: 'pulse 1.5s ease-in-out infinite',
        animationDelay: '0.2s',
      }}
    />
  </Paper>
)

// Skeleton loading component for table rows
const SkeletonTable: React.FC<{ rows?: number; columns?: number }> = ({ 
  rows = 5, 
  columns = 4 
}) => (
  <Paper sx={{ p: 2 }}>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <Box
        key={rowIndex}
        sx={{
          display: 'flex',
          gap: 2,
          py: 1,
          '&:not(:last-child)': {
            borderBottom: 1,
            borderColor: 'grey.200',
          },
        }}
      >
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Box
            key={colIndex}
            sx={{
              flex: 1,
              height: 20,
              bgcolor: 'grey.200',
              borderRadius: 1,
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${(rowIndex * columns + colIndex) * 0.1}s`,
            }}
          />
        ))}
      </Box>
    ))}
  </Paper>
)

export default LoadingSpinner
