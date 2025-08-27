import React from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  InputAdornment,
} from '@mui/material'
import {
  Email as EmailIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import { authApi } from '@/services/authApi'
import { useNotification } from '@/hooks/useNotification'

interface ForgotPasswordForm {
  email: string
}

const schema = yup.object({
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
})

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSubmitted, setIsSubmitted] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const {
    control,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<ForgotPasswordForm>({
    resolver: yupResolver(schema),
    defaultValues: {
      email: '',
    },
  })

  const onSubmit = async (data: ForgotPasswordForm) => {
    setIsLoading(true)
    setError(null)

    try {
      await authApi.forgotPassword(data.email)
      setIsSubmitted(true)
      showSuccess('Password reset instructions have been sent to your email.')
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to send password reset email. Please try again.'
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendEmail = async () => {
    const email = getValues('email')
    if (email) {
      await onSubmit({ email })
    }
  }

  const handleBackToLogin = () => {
    navigate('/auth/login')
  }

  if (isSubmitted) {
    return (
      <Box sx={{ textAlign: 'center' }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
            Check Your Email
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We've sent password reset instructions to{' '}
            <strong>{getValues('email')}</strong>
          </Typography>
        </Box>

        {/* Instructions */}
        <Alert severity="info" sx={{ mb: 4, textAlign: 'left' }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>What's next?</strong>
          </Typography>
          <Typography variant="body2" component="div">
            1. Check your email inbox for a password reset link
            <br />
            2. Click the link in the email to reset your password
            <br />
            3. Create a new password and sign in
          </Typography>
        </Alert>

        {/* Actions */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button
            variant="contained"
            size="large"
            onClick={handleBackToLogin}
            sx={{ py: 1.5 }}
          >
            Back to Sign In
          </Button>
          
          <Button
            variant="text"
            onClick={handleResendEmail}
            disabled={isLoading}
          >
            {isLoading ? 'Sending...' : 'Resend Email'}
          </Button>
        </Box>

        {/* Help */}
        <Box sx={{ mt: 4, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            <strong>Didn't receive the email?</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Check your spam folder or{' '}
            <Link href="mailto:support@erp.com" sx={{ textDecoration: 'none' }}>
              contact support
            </Link>{' '}
            if you continue to have issues.
          </Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Back Button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={handleBackToLogin}
        sx={{ mb: 2, color: 'text.secondary' }}
      >
        Back to Sign In
      </Button>

      {/* Header */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
          Forgot Password?
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Enter your email address and we'll send you instructions to reset your password
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Email Field */}
      <Controller
        name="email"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Email Address"
            type="email"
            autoComplete="email"
            autoFocus
            error={!!errors.email}
            helperText={errors.email?.message}
            sx={{ mb: 4 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      {/* Submit Button */}
      <Button
        type="submit"
        fullWidth
        variant="contained"
        size="large"
        disabled={isLoading}
        sx={{
          mb: 3,
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 600,
        }}
      >
        {isLoading ? 'Sending...' : 'Send Reset Instructions'}
      </Button>

      {/* Help Text */}
      <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Remember your password?{' '}
          <Link
            component={RouterLink}
            to="/auth/login"
            sx={{ fontWeight: 600, textDecoration: 'none' }}
          >
            Sign in here
          </Link>
        </Typography>
      </Box>
    </Box>
  )
}

export default ForgotPasswordPage