import React from 'react'
import {
  Box,
  Container,
  Paper,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material'

interface AuthLayoutProps {
  children: React.ReactNode
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        px: 2,
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={24}
          sx={{
            p: { xs: 3, sm: 4, md: 5 },
            borderRadius: 3,
            background: theme.palette.mode === 'dark' 
              ? 'rgba(30, 30, 30, 0.95)' 
              : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Logo and Title */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              mb: 4,
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 2,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1.75rem',
                mb: 2,
                boxShadow: 3,
              }}
            >
              ERP
            </Box>
            <Typography
              variant="h4"
              component="h1"
              sx={{
                fontWeight: 700,
                color: 'text.primary',
                textAlign: 'center',
                mb: 1,
              }}
            >
              ERP System
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ textAlign: 'center' }}
            >
              Enterprise Resource Planning Solution
            </Typography>
          </Box>

          {/* Auth Form */}
          <Box sx={{ width: '100%' }}>
            {children}
          </Box>
        </Paper>

        {/* Footer */}
        <Box
          sx={{
            mt: 4,
            textAlign: 'center',
            color: 'rgba(255, 255, 255, 0.8)',
          }}
        >
          <Typography variant="body2">
            Secure • Reliable • Scalable
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
            © 2024 ERP System. All rights reserved.
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}

export default AuthLayout