import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, {
  login,
  logout,
  setCredentials,
  clearAuth,
  selectCurrentUser,
  selectIsAuthenticated,
  selectAccessToken,
} from '../authSlice';
import { authApi } from '../../../services/authApi';

// Mock the authApi module
vi.mock('../../../services/authApi', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
    changePassword: vi.fn(),
  },
}));

// Type for the test store state
type TestRootState = {
  auth: ReturnType<typeof authReducer>;
};

describe('authSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        auth: authReducer,
      },
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().auth;

      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('setCredentials reducer', () => {
    it('should set user and tokens', () => {
      const mockUser = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'manager' as const,
        status: 'active' as const,
        isActive: true,
        failedLoginAttempts: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.dispatch(setCredentials({
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      }));

      const state = store.getState().auth;
      expect(state.user).toEqual(mockUser);
      expect(state.accessToken).toBe('access-token');
      expect(state.refreshToken).toBe('refresh-token');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('clearAuth reducer', () => {
    it('should clear all auth state', () => {
      // First set some auth state
      store.dispatch(setCredentials({
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      }));

      // Then clear it
      store.dispatch(clearAuth());

      const state = store.getState().auth;
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('login async thunk', () => {
    const mockAuthResponse = {
      data: {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        expiresIn: 900,
      },
    };

    it('should handle successful login', async () => {
      (authApi.login as any).mockResolvedValue(mockAuthResponse);

      const credentials = {
        usernameOrEmail: 'testuser',
        password: 'Password@123',
        rememberMe: false,
      };

      await store.dispatch(login(credentials));

      const state = store.getState().auth;
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.user).toEqual(mockAuthResponse.data.user);
      expect(state.accessToken).toBe(mockAuthResponse.data.accessToken);
      expect(state.refreshToken).toBe(mockAuthResponse.data.refreshToken);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should handle login failure', async () => {
      const errorMessage = 'Invalid credentials';
      const error = {
        response: {
          data: {
            message: errorMessage,
          },
        },
      };
      (authApi.login as any).mockRejectedValue(error);

      const credentials = {
        usernameOrEmail: 'testuser',
        password: 'WrongPassword',
        rememberMe: false,
      };

      await store.dispatch(login(credentials));

      const state = store.getState().auth;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should set loading state during login', async () => {
      (authApi.login as any).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockAuthResponse), 100))
      );

      const credentials = {
        usernameOrEmail: 'testuser',
        password: 'Password@123',
        rememberMe: false,
      };

      const promise = store.dispatch(login(credentials));

      // Check loading state immediately
      let state = store.getState().auth;
      expect(state.loading).toBe(true);

      await promise;

      // Check loading state after completion
      state = store.getState().auth;
      expect(state.loading).toBe(false);
    });
  });

  describe('logout async thunk', () => {
    beforeEach(async () => {
      // Set up authenticated state
      store.dispatch(setCredentials({
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      }));
    });

    it('should handle successful logout', async () => {
      (authApi.logout as any).mockResolvedValue({ data: { message: 'Logged out' } });

      const refreshToken = store.getState().auth.refreshToken;
      await store.dispatch(logout(refreshToken!));

      const state = store.getState().auth;
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should clear auth state even if logout API fails', async () => {
      (authApi.logout as any).mockRejectedValue(new Error('Network error'));

      const refreshToken = store.getState().auth.refreshToken;
      await store.dispatch(logout(refreshToken!));

      const state = store.getState().auth;
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      store.dispatch(setCredentials({
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      }));
    });

    it('should select current user', () => {
      const state = store.getState();
      const user = selectCurrentUser(state);

      expect(user).toBeDefined();
      expect(user?.username).toBe('testuser');
    });

    it('should select authentication status', () => {
      const state = store.getState();
      const isAuthenticated = selectIsAuthenticated(state);

      expect(isAuthenticated).toBe(true);
    });

    it('should select access token', () => {
      const state = store.getState();
      const token = selectAccessToken(state);

      expect(token).toBe('access-token');
    });
  });
});
