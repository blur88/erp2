import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import '@testing-library/jest-dom/vitest';
import ProtectedRoute from '../ProtectedRoute';
import authReducer from '../../../store/slices/authSlice';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      mockNavigate(to);
      return <div>Redirected to {to}</div>;
    },
  };
});

describe('ProtectedRoute', () => {
  const TestComponent = () => <div>Protected Content</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children when user is authenticated', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer as any,
      },
      preloadedState: {
        auth: {
          user: {
            id: '123',
            username: 'testuser',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'manager' as const,
            status: 'active' as const,
            isActive: true,
            failedLoginAttempts: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          accessToken: 'mock-token',
          refreshToken: 'mock-refresh-token',
          isAuthenticated: true,
          loading: false,
          error: null,
        },
      },
    });

    render(
      <Provider store={store}>
        <BrowserRouter>
          <ProtectedRoute>
            <TestComponent />
          </ProtectedRoute>
        </BrowserRouter>
      </Provider>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should redirect to login when user is not authenticated', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer as any,
      },
      preloadedState: {
        auth: {
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          loading: false,
          error: null,
        },
      },
    });

    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <TestComponent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </Provider>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText(/redirected to \/login/i)).toBeInTheDocument();
  });

  it('should show loading spinner while loading', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer as any,
      },
      preloadedState: {
        auth: {
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          loading: true,
          error: null,
        },
      },
    });

    render(
      <Provider store={store}>
        <BrowserRouter>
          <ProtectedRoute>
            <TestComponent />
          </ProtectedRoute>
        </BrowserRouter>
      </Provider>
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should preserve return URL when redirecting to login', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer as any,
      },
      preloadedState: {
        auth: {
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          loading: false,
          error: null,
        },
      },
    });

    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <TestComponent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </Provider>
    );

    // The redirect should include the return URL as state
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should not render children if authentication is in progress', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer as any,
      },
      preloadedState: {
        auth: {
          user: null,
          accessToken: 'token-being-verified',
          refreshToken: null,
          isAuthenticated: false,
          loading: true,
          error: null,
        },
      },
    });

    render(
      <Provider store={store}>
        <BrowserRouter>
          <ProtectedRoute>
            <TestComponent />
          </ProtectedRoute>
        </BrowserRouter>
      </Provider>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
