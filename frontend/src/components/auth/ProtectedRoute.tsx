import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAppSelector, useAppDispatch } from '@/hooks/useRedux';
import { getCurrentUser, clearAuth } from '@/store/slices/authSlice';

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

  // Determine if we should attempt token verification
  useEffect(() => {
    // Only verify if we have a token but not authenticated and haven't tried yet
    if (accessToken && !isAuthenticated && !user && !verificationAttempted.current) {
      verificationAttempted.current = true;
      setShouldVerify(true);

      // Set a hard timeout to force redirect to login if verification takes too long
      const timeoutId = setTimeout(() => {
        console.warn('Token verification timeout - forcing logout');
        dispatch(clearAuth());
        setShouldVerify(false);
      }, 3000); // 3 second timeout

      dispatch(getCurrentUser())
        .then(() => {
          clearTimeout(timeoutId);
          setShouldVerify(false);
        })
        .catch((error) => {
          // If verification fails, clear auth state
          console.error('Token verification failed:', error);
          clearTimeout(timeoutId);
          dispatch(clearAuth());
          setShouldVerify(false);
        });
    } else if (accessToken && !isAuthenticated && !user && verificationAttempted.current) {
      // Already attempted verification but still not authenticated - clear auth
      dispatch(clearAuth());
    } else if (!accessToken && !isAuthenticated) {
      // No token and not authenticated - ready to redirect
      setShouldVerify(false);
    }
  }, [accessToken, isAuthenticated, user, dispatch]);

  // Show loading spinner only while actively verifying
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
