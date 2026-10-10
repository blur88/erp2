import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
  LinearProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { default as Visibility } from '@mui/icons-material/Visibility'
import { default as VisibilityOff } from '@mui/icons-material/VisibilityOff'
import { default as WarningIcon } from '@mui/icons-material/Warning'
import { default as LockIcon } from '@mui/icons-material/Lock';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux';
import { changePassword, ChangePasswordData, selectIsAuthenticated } from '@/store/slices/authSlice';
import { sessionRuntime } from '@/session';

// Password validation schema
const passwordSchema = yup.object({
  currentPassword: yup
    .string()
    .required('Current password is required'),
  newPassword: yup
    .string()
    .required('New password is required')
    .min(8, 'Password must be at least 8 characters')
    .matches(/[a-z]/, 'Password must contain at least one lowercase letter')
    .matches(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .matches(/[0-9]/, 'Password must contain at least one number')
    .matches(/[@$!%*?&#.]/, 'Password must contain at least one special character (@$!%*?&#.)'),
  newPasswordConfirmation: yup
    .string()
    .required('Password confirmation is required')
    .oneOf([yup.ref('newPassword')], 'Passwords must match'),
});

const MandatoryPasswordChangePage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error, user } = useAppSelector((state) => state.auth);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  // True from submission until it fails. A successful change ends the session
  // itself, and the page then stays for its confirmation before it leaves.
  const [changing, setChanging] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  // Set by a successful change. The session is over, so the form is finished
  // with: a second submission would be refused and would cut the confirmation short.
  const changed = successMessage !== '';

  // The page needs the session it changes the password of. When that ends for
  // any other reason (ended or changed in another tab, a failed refresh, the
  // Logout button below), the tab goes to the sign-in form. Nothing is requested.
  useEffect(() => {
    if (!isAuthenticated && !changing) navigate('/login', { replace: true });
  }, [isAuthenticated, changing, navigate]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    };
  }, []);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordData>({
    resolver: yupResolver(passwordSchema) as any,
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      newPasswordConfirmation: '',
    },
  });

  const onSubmit = async (data: ChangePasswordData) => {
    try {
      setSuccessMessage('');
      setChanging(true);
      await dispatch(changePassword(data)).unwrap();
      // Left while the change was in flight: the cleanup above has already run,
      // so a timer started now would navigate from wherever the tab is.
      if (!mounted.current) return;

      setSuccessMessage('Password changed successfully! All sessions have been signed out.');

      leaveTimer.current = setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err: any) {
      console.error('Password change error:', err);
      setChanging(false);
    }
  };

  // Signing out ends the session, and the effect above then leaves the page.
  const handleLogout = async () => {
    try {
      await sessionRuntime.signOut();
    } catch (error) {
      void error;
    }
  };

  if (!isAuthenticated && !changing) return null;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: theme.palette.background.default,
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={8}
          sx={{
            p: 4,
            borderRadius: 2,
          }}
        >
          {/* Header with Warning */}
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'warning.light',
                mb: 2,
              }}
            >
              <LockIcon sx={{ fontSize: 32, color: 'warning.dark' }} />
            </Box>
            <Typography variant="h4" component="h1" gutterBottom sx={{
              fontWeight: "bold"
            }}>
              Password Change Required
            </Typography>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              {user?.username ? `Logged in as: ${user.username}` : ''}
            </Typography>
          </Box>

          {/* Warning Alert */}
          <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{
              fontWeight: "medium"
            }}>
              For security reasons, you must change your password before accessing the application.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              You are currently using the default admin credentials. Please create a strong, unique password.
            </Typography>
          </Alert>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {/* Success Alert */}
          {successMessage && (
            <Alert severity="success" sx={{ mb: 3 }}>
              {successMessage}
            </Alert>
          )}

          {/* Password Change Form */}
          <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Current Password */}
            <Controller
              name="currentPassword"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Current Password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  margin="normal"
                  error={!!errors.currentPassword}
                  helperText={errors.currentPassword?.message}
                  disabled={loading || changed}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            edge="end"
                          >
                            {showCurrentPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            />

            {/* New Password */}
            <Controller
              name="newPassword"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="New Password"
                  type={showNewPassword ? 'text' : 'password'}
                  margin="normal"
                  error={!!errors.newPassword}
                  helperText={errors.newPassword?.message}
                  disabled={loading || changed}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            edge="end"
                          >
                            {showNewPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            />

            {/* Confirm New Password */}
            <Controller
              name="newPasswordConfirmation"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Confirm New Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  margin="normal"
                  error={!!errors.newPasswordConfirmation}
                  helperText={errors.newPasswordConfirmation?.message}
                  disabled={loading || changed}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            edge="end"
                          >
                            {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            />

            {/* Password Requirements */}
            <Box sx={{ mt: 2, mb: 3 }}>
              <Typography
                variant="caption"
                gutterBottom
                sx={{
                  color: "text.secondary",
                  display: "block"
                }}>
                Password Requirements:
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block"
                }}>
                • At least 8 characters long
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block"
                }}>
                • Contains uppercase and lowercase letters
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block"
                }}>
                • Contains at least one number
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block"
                }}>
                • Contains at least one special character (@$!%*?&#.)
              </Typography>
            </Box>

            {/* Loading Bar */}
            {loading && <LinearProgress sx={{ mb: 2 }} />}

            {/* Submit Button */}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading || changed}
              sx={{ mt: 2, mb: 2 }}
            >
              {loading ? 'Changing Password...' : 'Change Password'}
            </Button>

            {/* Logout Button */}
            <Button
              fullWidth
              variant="outlined"
              color="secondary"
              onClick={handleLogout}
              disabled={loading || changed}
            >
              Logout
            </Button>
          </Box>
        </Paper>

        {/* Additional Security Notice */}
        <Paper
          elevation={2}
          sx={{
            mt: 3,
            p: 2,
            bgcolor: theme.palette.info.light,
            borderRadius: 2,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: "info.dark",
              textAlign: "center"
            }}>
            Your password will be securely encrypted and stored. After changing your password,
            all active sessions will be terminated and you will need to log in again.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};

export default MandatoryPasswordChangePage;
