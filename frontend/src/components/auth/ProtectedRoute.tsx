import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAppSelector, useAppDispatch } from '@/hooks/useRedux';
import { getCurrentUser } from '@/store/slices/authSlice';
import StorageUnavailableScreen from './StorageUnavailableScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const verificationAttempted = useRef(false);
  const [shouldVerify, setShouldVerify] = useState(false);

  const isAuthenticated = useAppSelector((state) => state.auth?.isAuthenticated || false);
  const loading = useAppSelector((state) => state.auth?.loading || false);
  const accessToken = useAppSelector((state) => state.auth?.accessToken || null);
  const user = useAppSelector((state) => state.auth?.user || null);
  const storageUnavailable = useAppSelector((state) => state.auth?.storageUnavailable || false);

  // The session runtime owns the token and the claim; this effect only refreshes
  // the user profile once the runtime has established a session (accessToken set)
  // but the user object is not yet mirrored.
  useEffect(() => {
    if (accessToken && !user && !verificationAttempted.current) {
      verificationAttempted.current = true;
      setShouldVerify(true);

      const timeoutId = setTimeout(() => {
        setShouldVerify(false);
      }, 3000);

      dispatch(getCurrentUser())
        .then(() => {
          clearTimeout(timeoutId);
          setShouldVerify(false);
        })
        .catch(() => {
          clearTimeout(timeoutId);
          setShouldVerify(false);
        });
    } else if (!accessToken && !isAuthenticated) {
      setShouldVerify(false);
    }
  }, [accessToken, user, isAuthenticated, dispatch]);

  if (storageUnavailable) {
    return <StorageUnavailableScreen />;
  }

  if (shouldVerify || loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'background.default',
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect to mandatory password change if required
  if (user?.requiresPasswordChange && location.pathname !== '/change-password-required') {
    return <Navigate to="/change-password-required" replace />;
  }

  // Render children if authenticated
  return <>{children}</>;
};

export default ProtectedRoute;
