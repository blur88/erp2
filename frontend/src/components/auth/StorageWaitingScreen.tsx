import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';

// Shown when the start-up read of the session record timed out. Storage has not
// answered: whether a session is stored is not known, so this is neither the
// sign-in form nor the storage-unavailable message, and it offers neither.
const StorageWaitingScreen: React.FC<{ onRetry: () => Promise<void> }> = ({ onRetry }) => {
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      // An answer replaces this screen; only a second timeout leaves it mounted.
      if (mounted.current) setRetrying(false);
    }
  };

  return (
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
      <Typography variant="h5">Waiting for session storage</Typography>
      <Typography variant="body1" color="text.secondary">
        Still waiting for this browser’s session storage. Another tab may be busy.
      </Typography>
      <Button variant="contained" onClick={handleRetry} disabled={retrying}>
        {retrying ? 'Trying…' : 'Try again'}
      </Button>
    </Box>
  );
};

export default StorageWaitingScreen;
