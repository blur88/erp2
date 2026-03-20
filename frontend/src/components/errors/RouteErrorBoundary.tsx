import { Box, Button, Paper, Typography } from '@mui/material'
import { Link, useRouteError } from 'react-router-dom'
import { classifyRouteError } from '@/utils/routeErrorClassification'

export default function RouteErrorBoundary() {
  const error = useRouteError()
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
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            A new version of the app is available. Refresh the page to continue.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
            <Button variant="outlined" component={Link} to="/">
              Go to Dashboard
            </Button>
          </Box>
        </Paper>
      </Box>
    )
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
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The app hit an unexpected error. You can reload the page or return to the dashboard.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
          <Button variant="outlined" component={Link} to="/">
            Go Home
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
