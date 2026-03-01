import React, { useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  IconButton,
  InputAdornment,
} from '@mui/material'
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { userManagementApi } from '@/services/userManagementApi'
import { useNotification } from '@/hooks/useNotification'
import type { User, UserRole } from '@/types'

// Form validation schema
const userSchema = yup.object({
  username: yup
    .string()
    .required('Username is required')
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be less than 50 characters')
    .matches(
      /^[a-zA-Z0-9._-]+$/,
      'Username can only contain letters, numbers, dots, underscores, and hyphens'
    ),
  email: yup
    .string()
    .optional()
    .nullable()
    .transform((value) => value?.trim() || null)
    .email('Invalid email format')
    .max(255, 'Email must be less than 255 characters'),
  password: yup
    .string()
    .when('$isEdit', {
      is: false,
      then: (schema) =>
        schema
          .required('Password is required')
          .min(8, 'Password must be at least 8 characters')
          .matches(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]/,
            'Password must contain uppercase, lowercase, number, and special character (@$!%*?&.)'
          ),
      otherwise: (schema) =>
        schema
          .optional()
          .nullable()
          .test('password-complexity', 'Password must contain uppercase, lowercase, number, and special character (@$!%*?&.)', function(value) {
            if (!value || value.length === 0) return true // Optional when editing
            return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]/.test(value) && value.length >= 8;
          }),
    }),
  passwordConfirmation: yup
    .string()
    .when('password', {
      is: (password: string) => password && password.length > 0,
      then: (schema) =>
        schema
          .required('Password confirmation is required')
          .oneOf([yup.ref('password')], 'Passwords must match'),
      otherwise: (schema) => schema.optional().nullable(),
    }),
  firstName: yup
    .string()
    .optional()
    .nullable()
    .transform((value) => value?.trim() || null)
    .max(100, 'First name must be less than 100 characters'),
  lastName: yup
    .string()
    .optional()
    .nullable()
    .transform((value) => value?.trim() || null)
    .max(100, 'Last name must be less than 100 characters'),
  phoneNumber: yup
    .string()
    .optional()
    .nullable()
    .transform((value) => value?.trim() || null)
    .max(20, 'Phone number must be less than 20 characters'),
  role: yup
    .string()
    .oneOf(['admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff'])
    .required('Role is required'),
  status: yup.string().oneOf(['active', 'inactive', 'suspended']).required('Status is required'),
  notes: yup
    .string()
    .optional()
    .nullable()
    .transform((value) => value?.trim() || null),
})

interface UserFormData {
  username: string
  email?: string | null
  password?: string
  passwordConfirmation?: string
  firstName?: string | null
  lastName?: string | null
  phoneNumber?: string | null
  role: UserRole
  status: 'active' | 'inactive' | 'suspended'
  notes?: string | null
}

interface UserFormDialogProps {
  open: boolean
  user: User | null
  currentUser: User | null
  onClose: () => void
  onSuccess: () => void
}

const UserFormDialog: React.FC<UserFormDialogProps> = ({ open, user, currentUser, onClose, onSuccess }) => {
  const { showSuccess, showError } = useNotification()
  const [showPassword, setShowPassword] = React.useState(false)
  const [showPasswordConfirmation, setShowPasswordConfirmation] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const isEdit = !!user
  const isSelfEdit = isEdit && user?.id === currentUser?.id
  const isAdmin = currentUser?.role === 'admin'
  const canEditRole = isAdmin && !isSelfEdit
  const canEditStatus = isAdmin && !isSelfEdit

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: yupResolver(userSchema) as any,
    context: { isEdit },
    defaultValues: {
      username: '',
      email: null,
      password: '',
      passwordConfirmation: '',
      firstName: null,
      lastName: null,
      phoneNumber: null,
      role: 'sales_staff',
      status: 'active',
      notes: null,
    },
  })

  // Reset form when user changes or dialog opens
  useEffect(() => {
    if (open) {
      if (user) {
        reset({
          username: user.username,
          email: user.email,
          password: '',
          passwordConfirmation: '',
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber || null,
          role: user.role,
          status: user.status,
          notes: user.notes || null,
        })
      } else {
        reset({
          username: '',
          email: null,
          password: '',
          passwordConfirmation: '',
          firstName: null,
          lastName: null,
          phoneNumber: null,
          role: 'sales_staff',
          status: 'active',
          notes: null,
        })
      }
    }
  }, [user, open, reset])

  const onSubmit = async (data: UserFormData) => {
    try {
      setSubmitting(true)

      // Prepare data
      const submitData: any = {
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber?.trim() || null,
        notes: data.notes?.trim() || null,
      }

      // Only include role and status if user has permission to edit them
      if (canEditRole) {
        submitData.role = data.role
      }
      if (canEditStatus) {
        submitData.status = data.status
      }

      // Include password only if provided
      if (data.password && data.password.trim().length > 0) {
        submitData.password = data.password
      }

      if (user) {
        // Update existing user
        await userManagementApi.updateUser(user.id, submitData)
        showSuccess(isSelfEdit ? 'Profile updated successfully' : 'User updated successfully')
      } else {
        // Create new user
        if (!submitData.password) {
          showError('Password is required for new users')
          return
        }
        // New users always need role and status
        submitData.role = data.role
        submitData.status = data.status
        await userManagementApi.createUser(submitData)
        showSuccess('User created successfully')
      }

      onSuccess()
    } catch (err: any) {
      console.error('Failed to save user:', err)
      showError(err.response?.data?.message || 'Failed to save user')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? 'Edit User' : 'Add New User'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {/* Account Information */}
            <Grid size={12}>
              <Typography variant="h6" gutterBottom>
                Account Information
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="username"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Username"
                    error={!!errors.username}
                    helperText={isEdit ? 'Username cannot be changed' : errors.username?.message}
                    disabled={isEdit}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Email (optional)"
                    type="email"
                    error={!!errors.email}
                    helperText={errors.email?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label={isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
                    type={showPassword ? 'text' : 'password'}
                    error={!!errors.password}
                    helperText={
                      errors.password?.message ||
                      'Min 8 chars: uppercase, lowercase, number, special (@$!%*?&.)'
                    }
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword(!showPassword)}
                              edge="end"
                              size="small"
                            >
                              {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="passwordConfirmation"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Confirm Password"
                    type={showPasswordConfirmation ? 'text' : 'password'}
                    error={!!errors.passwordConfirmation}
                    helperText={errors.passwordConfirmation?.message}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPasswordConfirmation(!showPasswordConfirmation)}
                              edge="end"
                              size="small"
                            >
                              {showPasswordConfirmation ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                )}
              />
            </Grid>

            {/* Personal Information */}
            <Grid size={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Personal Information
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="firstName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="First Name (optional)"
                    error={!!errors.firstName}
                    helperText={errors.firstName?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="lastName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Last Name (optional)"
                    error={!!errors.lastName}
                    helperText={errors.lastName?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="phoneNumber"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Phone Number"
                    error={!!errors.phoneNumber}
                    helperText={errors.phoneNumber?.message}
                  />
                )}
              />
            </Grid>

            {/* Role and Status */}
            <Grid size={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Role & Status
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.role}>
                    <InputLabel>Role</InputLabel>
                    <Select {...field} label="Role" disabled={!canEditRole}>
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="manager">Manager</MenuItem>
                      <MenuItem value="sales_staff">Sales Staff</MenuItem>
                      <MenuItem value="inventory_staff">Inventory Staff</MenuItem>
                      <MenuItem value="procurement_staff">Procurement Staff</MenuItem>
                    </Select>
                    {errors.role && (
                      <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                        {errors.role.message}
                      </Typography>
                    )}
                    {!canEditRole && isSelfEdit && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5, display: 'block' }}>
                        You cannot change your own role
                      </Typography>
                    )}
                  </FormControl>
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.status}>
                    <InputLabel>Status</InputLabel>
                    <Select {...field} label="Status" disabled={!canEditStatus}>
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="inactive">Inactive</MenuItem>
                      <MenuItem value="suspended">Suspended</MenuItem>
                    </Select>
                    {errors.status && (
                      <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                        {errors.status.message}
                      </Typography>
                    )}
                    {!canEditStatus && isSelfEdit && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5, display: 'block' }}>
                        You cannot change your own status
                      </Typography>
                    )}
                  </FormControl>
                )}
              />
            </Grid>

            {/* Notes */}
            <Grid size={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Notes"
                    multiline
                    rows={3}
                    error={!!errors.notes}
                    helperText={errors.notes?.message}
                  />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default UserFormDialog
