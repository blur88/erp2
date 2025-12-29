import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAppSelector, useAppDispatch } from '@/hooks/useRedux';
import { getCurrentUser } from '@/store/slices/authSlice';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const dispatch = useAppDispatch();

  const isAuthenticated = useAppSelector((state) => state.auth?.isAuthenticated || false);
  const loading = useAppSelector((state) => state.auth?.loading || false);
  const accessToken = useAppSelector((state) => state.auth?.accessToken || null);

  // If we have a token but no authentication status, verify with backend
  useEffect(() => {
    if (accessToken && !isAuthenticated && !loading) {
      dispatch(getCurrentUser());
    }
  }, [accessToken, isAuthenticated, loading, dispatch]);

  // Show loading spinner while checking authentication
  if (loading) {
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

  // Render children if authenticated
  return <>{children}</>;
};

export default ProtectedRoute;
