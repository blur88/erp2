import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  IconButton,
  InputAdornment,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Lock as LockIcon,
  Login as LoginIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux';
import {
  login,
  clearError,
} from '@/store/slices/authSlice';
import type { LoginCredentials } from '@/store/slices/authSlice';
import { authApi } from '@/services/authApi';

const schema = yup.object({
  usernameOrEmail: yup.string().required('Username or email is required'),
  password: yup.string().required('Password is required'),
  rememberMe: yup.boolean(),
});

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();

  const isAuthenticated = useAppSelector((state) => state.auth?.isAuthenticated || false);
  const loading = useAppSelector((state) => state.auth?.loading || false);
  const error = useAppSelector((state) => state.auth?.error || null);

  const [showPassword, setShowPassword] = useState(false);
  const [showDefaultCredentials, setShowDefaultCredentials] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginCredentials>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      usernameOrEmail: '',
      password: '',
      rememberMe: false,
    },
  });

  // Fetch default credentials visibility from server on component mount
  useEffect(() => {
    const fetchCredentialsVisibility = async () => {
      try {
        const response = await authApi.shouldShowDefaultCredentials();
        setShowDefaultCredentials(response.data.showDefaultCredentials);
      } catch (error) {
        console.error('Failed to fetch default credentials visibility:', error);
        // Default to not showing credentials on error
        setShowDefaultCredentials(false);
      }
    };

    fetchCredentialsVisibility();
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  const onSubmit = async (data: LoginCredentials) => {
    try {
      await dispatch(login(data)).unwrap();
      // Navigation is handled by the useEffect above
    } catch (err) {
      // Error is handled by Redux state
      console.error('Login failed:', err);
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 2,
      }}
    >
      <Paper
        elevation={10}
        sx={{
          padding: 4,
          width: '100%',
          maxWidth: 450,
          borderRadius: 2,
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: 'primary.main',
              mb: 2,
            }}
          >
            <LockIcon sx={{ fontSize: 32, color: 'white' }} />
          </Box>
          <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom>
            Welcome Back
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to your ERP account
          </Typography>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => dispatch(clearError())}>
            {error}
          </Alert>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Username or Email */}
            <Controller
              name="usernameOrEmail"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Username or Email"
                  placeholder="Enter your username or email"
                  error={!!errors.usernameOrEmail}
                  helperText={errors.usernameOrEmail?.message}
                  autoFocus
                  autoComplete="username"
                />
              )}
            />

            {/* Password */}
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  placeholder="Enter your password"
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  autoComplete="current-password"
                  InputProps={{
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

            {/* Remember Me */}
            <Controller
              name="rememberMe"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value} />}
                  label="Remember me for 7 days"
                />
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <LoginIcon />}
              sx={{ mt: 1, py: 1.5 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </Box>
        </form>

        {/* Default Admin Credentials Info - Only show if password hasn't been changed */}
        {showDefaultCredentials && (
          <Box sx={{ mt: 3, p: 2.5, bgcolor: 'info.lighter', borderRadius: 1, border: 1, borderColor: 'info.light' }}>
            <Typography variant="subtitle2" color="info.dark" gutterBottom fontWeight="bold">
              Default Admin Credentials:
            </Typography>
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'background.paper', borderRadius: 1, fontFamily: 'monospace' }}>
              <Typography variant="body2" color="text.primary">
                <strong>Username:</strong> admin
              </Typography>
              <Typography variant="body2" color="text.primary">
                <strong>Password:</strong> Admin@123!
              </Typography>
            </Box>
            <Alert severity="warning" sx={{ mt: 2 }} icon={false}>
              <Typography variant="caption" fontWeight="medium">
                You will be required to change this password immediately after first login for security reasons.
              </Typography>
            </Alert>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default LoginPage;
