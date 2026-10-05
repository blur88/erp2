import React from 'react';
import { Box, Button, Typography } from '@mui/material';

const StorageUnavailableScreen: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: 2,
      p: 4,
      textAlign: 'center',
    }}
  >
    <Typography variant="h5">Session storage unavailable</Typography>
    <Typography variant="body1" color="text.secondary">
      This browser cannot store your session safely. Allow site data for this address, then reload.
    </Typography>
    <Button variant="contained" onClick={() => window.location.reload()}>
      Reload
    </Button>
  </Box>
);

export default StorageUnavailableScreen;
