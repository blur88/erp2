import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';

// How often a visible waiting tab asks storage again without being told to.
// The tab that blocked storage may resume and finish without anything reaching
// this one: no channel message, and no resume here if this tab stayed visible.
const AUTO_RETRY_MS = 10_000;

// Shown when the start-up read of the session record timed out. Storage has not
// answered: whether a session is stored is not known, so this is neither the
// sign-in form nor the storage-unavailable message, and it offers neither.
const StorageWaitingScreen: React.FC<{ onRetry: () => Promise<void> }> = ({ onRetry }) => {
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(true);
  // One request at a time, whether the button, the timer or a return to the
  // tab asked for it: whoever asks second joins the one under way.
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ask = useCallback((): Promise<void> => {
    if (!inFlight.current) {
      const request = onRetry().finally(() => {
        if (inFlight.current === request) inFlight.current = null;
      });
      inFlight.current = request;
    }
    return inFlight.current;
  }, [onRetry]);

  // The button says it is trying; a retry nobody pressed for does not touch it.
  const handleRetry = async () => {
    setRetrying(true);
    try {
      await ask();
    } finally {
      // An answer replaces this screen; only a second timeout leaves it mounted.
      if (mounted.current) setRetrying(false);
    }
  };

  // Only while the tab is visible: a hidden tab asks nothing, and asks at once
  // when it is shown again.
  useEffect(() => {
    const retryQuietly = () => {
      void ask().catch(() => undefined);
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const run = () => {
      stop();
      timer = setInterval(retryQuietly, AUTO_RETRY_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        retryQuietly();
        run();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ask]);

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
