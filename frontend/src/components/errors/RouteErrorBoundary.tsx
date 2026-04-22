import { Box, Paper, Typography } from '@mui/material'
import { AppButton } from '@/components/common/AppButton'
import { useNavigate, useRouteError } from 'react-router-dom'
import { classifyRouteError } from '@/utils/routeErrorClassification'

export default function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()
  const { type } = classifyRouteError(error)
  // classifyRouteError also returns `message` for future use; UI uses hard-coded copy per spec.
  // Log unexpected errors for observability (chunk-load failures are deployment-related, not bugs).
  if (type === 'generic') {
    console.error('[RouteErrorBoundary]', error)
  }

  if (type === 'chunk-load') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <Typography variant="h5" component="h1" gutterBottom>
            App Updated
          </Typography>
          <Typography
            sx={{
              color: "text.secondary",
              mb: 3
            }}>
            A new version of the app is available. Refresh the page to continue.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <AppButton variant="primary" onClick={() => window.location.reload()}>
              Refresh Page
            </AppButton>
            <AppButton variant="outlined" onClick={() => navigate('/')}>
              Go to Dashboard
            </AppButton>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Something Went Wrong
        </Typography>
        <Typography
          sx={{
            color: "text.secondary",
            mb: 3
          }}>
          The app hit an unexpected error. You can reload the page or return to the dashboard.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <AppButton variant="primary" onClick={() => window.location.reload()}>
            Reload Page
          </AppButton>
          <AppButton variant="outlined" onClick={() => navigate('/')}>
            Go Home
          </AppButton>
        </Box>
      </Paper>
    </Box>
  );
}
