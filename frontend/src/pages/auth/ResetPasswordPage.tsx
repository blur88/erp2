import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Lock as LockIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import { authApi } from '@/services/authApi'
import { useNotification } from '@/hooks/useNotification'

interface ResetPasswordForm {
  password: string
  confirmPassword: string
}

const schema = yup.object({
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain uppercase, lowercase, number and special character'
    )
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
})

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showSuccess, showError } = useNotification()
  
  const [isLoading, setIsLoading] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isSuccess, setIsSuccess] = React.useState(false)

  const token = searchParams.get('token')

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: yupResolver(schema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  React.useEffect(() => {
    if (!token) {
      showError('Invalid or missing reset token. Please request a new password reset.')
      navigate('/auth/forgot-password')
    }
  }, [token, navigate, showError])

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) return

    setIsLoading(true)
    setError(null)

    try {
      await authApi.resetPassword(token, data.password)
      setIsSuccess(true)
      showSuccess('Password reset successfully! You can now sign in with your new password.')
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to reset password. Please try again.'
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  const handleToggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword)
  }

  const handleGoToLogin = () => {
    navigate('/auth/login')
  }

  if (!token) {
    return null // Will redirect in useEffect
  }

  if (isSuccess) {
    return (
      <Box sx={{ textAlign: 'center' }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 1, color: 'success.main' }}>
            Password Reset Successful!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your password has been successfully updated
          </Typography>
        </Box>

        {/* Success Message */}
        <Alert severity="success" sx={{ mb: 4 }}>
          <Typography variant="body2">
            You can now sign in to your account using your new password.
          </Typography>
        </Alert>

        {/* Action Button */}
        <Button
          variant="contained"
          size="large"
          onClick={handleGoToLogin}
          sx={{ py: 1.5, px: 4 }}
        >
          Continue to Sign In
        </Button>
      </Box>
    )
  }

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Header */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
          Reset Your Password
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Enter your new password below
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Password Field */}
      <Controller
        name="password"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            error={!!errors.password}
            helperText={errors.password?.message}
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={handleTogglePasswordVisibility}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      {/* Confirm Password Field */}
      <Controller
        name="confirmPassword"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Confirm New Password"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            error={!!errors.confirmPassword}
            helperText={errors.confirmPassword?.message}
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={handleToggleConfirmPasswordVisibility}
                    edge="end"
                  >
                    {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      {/* Password Requirements */}
      <Box sx={{ mb: 4, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Password Requirements:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            • At least 8 characters long
          </Typography>
          <Typography variant="caption" color="text.secondary">
            • Contains uppercase and lowercase letters
          </Typography>
          <Typography variant="caption" color="text.secondary">
            • Contains at least one number
          </Typography>
          <Typography variant="caption" color="text.secondary">
            • Contains at least one special character (@$!%*?&)
          </Typography>
        </Box>
      </Box>

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
        {isLoading ? 'Resetting Password...' : 'Reset Password'}
      </Button>

      {/* Back to Login */}
      <Box sx={{ textAlign: 'center' }}>
        <Button
          variant="text"
          onClick={handleGoToLogin}
          disabled={isLoading}
        >
          Back to Sign In
        </Button>
      </Box>
    </Box>
  )
}

export default ResetPasswordPage