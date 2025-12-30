import React from 'react'
import { Box, Typography, Paper, Divider, Chip } from '@mui/material'
import {
  Lock as LockIcon,
  Password as PasswordIcon,
  Token as TokenIcon,
  Block as BlockIcon,
  Schedule as ScheduleIcon,
  Info as InfoIcon,
} from '@mui/icons-material'

const SecuritySettingsPage: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <LockIcon sx={{ fontSize: 40, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Security Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View current security configuration and policies
          </Typography>
        </Box>
      </Box>

      {/* Information Alert */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: 'info.lighter', borderLeft: 4, borderColor: 'info.main' }}>
        <Box sx={{ display: 'flex', alignItems: 'start', gap: 1 }}>
          <InfoIcon sx={{ color: 'info.main', mt: 0.25 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Read-Only Display
            </Typography>
            <Typography variant="body2" color="text.secondary">
              These security settings are configured at the system level. Contact your system administrator
              to modify these values.
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {/* Account Lockout Policy */}
        <Paper sx={{ p: 3, height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <BlockIcon sx={{ fontSize: 32, color: 'error.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Account Lockout Policy
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Failed Login Attempts Threshold
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  5
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  attempts
                </Typography>
              </Box>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Lockout Duration
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  30
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  minutes
                </Typography>
              </Box>
            </Box>
            <Paper sx={{ p: 1.5, bgcolor: 'grey.50', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                User accounts are automatically locked after 5 consecutive failed login attempts.
                The account will be unlocked after 30 minutes, or an admin can manually unlock it.
              </Typography>
            </Paper>
          </Box>
        </Paper>

        {/* Password Requirements */}
        <Paper sx={{ p: 3, height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <PasswordIcon sx={{ fontSize: 32, color: 'warning.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Password Requirements
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Minimum Length
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  8
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  characters
                </Typography>
              </Box>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 1 }}>
                Required Complexity
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                <Chip label="Uppercase Letter" size="small" color="primary" variant="outlined" />
                <Chip label="Lowercase Letter" size="small" color="primary" variant="outlined" />
                <Chip label="Number" size="small" color="primary" variant="outlined" />
                <Chip label="Special Character" size="small" color="primary" variant="outlined" />
              </Box>
            </Box>
            <Paper sx={{ p: 1.5, bgcolor: 'grey.50', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                All passwords must be at least 8 characters and include uppercase, lowercase, numbers,
                and special characters (@$!%*?&).
              </Typography>
            </Paper>
          </Box>
        </Paper>

        {/* Token Settings */}
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <TokenIcon sx={{ fontSize: 32, color: 'success.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              JWT Token Settings
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Access Token Expiry
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  15
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  minutes
                </Typography>
              </Box>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Refresh Token Expiry
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  7
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  days
                </Typography>
              </Box>
            </Box>
            <Paper sx={{ p: 1.5, bgcolor: 'grey.50', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Access tokens expire after 15 minutes for security. Refresh tokens are automatically rotated
                and expire after 7 days of inactivity.
              </Typography>
            </Paper>
          </Box>
        </Paper>

        {/* Token Cleanup */}
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <ScheduleIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Automatic Maintenance
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Token Cleanup Schedule
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  Daily
                </Typography>
                <Chip label="2:00 AM" size="small" color="primary" />
              </Box>
            </Box>
            <Paper sx={{ p: 1.5, bgcolor: 'grey.50', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Expired refresh tokens are automatically removed from the database daily at 2:00 AM
                to maintain optimal performance and security.
              </Typography>
            </Paper>
          </Box>
        </Paper>
      </Box>

      {/* Security Best Practices */}
      <Paper sx={{ p: 3, bgcolor: 'success.lighter', mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'success.dark' }}>
          Security Best Practices
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Password Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • Change default passwords immediately
              <br />
              • Use unique passwords for each user
              <br />
              • Update passwords every 90 days
              <br />• Never share account credentials
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Access Control
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • Assign minimum required permissions
              <br />
              • Review user access regularly
              <br />
              • Deactivate unused accounts promptly
              <br />• Monitor login activity in audit logs
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              System Security
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • Enable HTTPS in production
              <br />
              • Keep system up to date
              <br />
              • Regular backup schedules
              <br />• Review security logs weekly
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}

export default SecuritySettingsPage
