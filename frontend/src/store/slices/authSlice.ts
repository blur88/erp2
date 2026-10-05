import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/services/authApi';
import { SessionChangedElsewhereError } from '@/session/runtime';
import type { RootState } from '@/store';
import type { ActiveSession } from '@/session/types';

// Auth-specific User interface matching backend
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  phoneNumber?: string;
  role: 'admin' | 'manager' | 'sales_staff' | 'inventory_staff' | 'procurement_staff';
  status: 'active' | 'inactive' | 'suspended';
  isActive: boolean;
  lastLoginAt?: Date | string;
  lastLoginIp?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date | string;
  isLocked?: boolean;
  notes?: string;
  requiresPasswordChange?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  expiresIn: number;
  requiresPasswordChange?: boolean;
}

export interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  lastActivityTime: number | null;
  inactivityTimeoutMinutes: number; // Configurable inactivity timeout
  rememberMe: boolean; // Track if user selected "Remember me"
  sessionId: string | null;
  generation: number;
  storageUnavailable: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  lastActivityTime: null,
  inactivityTimeoutMinutes: 30, // Default: 30 minutes
  rememberMe: false, // Default: false
  sessionId: null,
  generation: 0,
  storageUnavailable: false,
};

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const { sessionRuntime } = await import('@/session');
      await sessionRuntime.signIn(credentials);
      return null;
    } catch (error: any) {
      if (error instanceof SessionChangedElsewhereError) {
        return rejectWithValue('The session changed in another tab. Sign in again.');
      }
      return rejectWithValue(error.message || 'Login failed');
    }
  }
);

export const getCurrentUser = createAsyncThunk(
  'auth/getCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authApi.getCurrentUser();
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get current user');
    }
  }
);

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (data: ChangePasswordData, { rejectWithValue }) => {
    try {
      await authApi.changePassword(data);
      const { sessionRuntime } = await import('@/session');
      await sessionRuntime.passwordChanged();
      return null;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Password change failed');
    }
  }
);

// Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionEstablished: (state, action: PayloadAction<ActiveSession>) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.error = null;
      state.lastActivityTime = Date.now();
      state.rememberMe = action.payload.rememberMe;
      state.sessionId = action.payload.sessionId;
      state.generation = action.payload.generation;
    },
    tokensUpdated: (
      state,
      action: PayloadAction<{ accessToken: string; accessTokenExpiresAt: number; refreshToken: string }>
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    sessionEnded: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
      state.lastActivityTime = null;
      state.rememberMe = false;
      state.sessionId = null;
      state.generation = 0;
    },    storageUnavailable: (state) => {
      state.storageUnavailable = true;
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.sessionId = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state) => {
        state.loading = false;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    // Get current user
    builder
      .addCase(getCurrentUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload;
          state.loading = false;
        }
      })
      .addCase(getCurrentUser.rejected, (state) => {
        state.loading = false;
      });

    // Change password
    builder
      .addCase(changePassword.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  sessionEstablished,
  tokensUpdated,
  sessionEnded,
  storageUnavailable,
  clearError,
} = authSlice.actions;

export const selectCurrentUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectAccessToken = (state: RootState) => state.auth.accessToken;
export const selectRefreshToken = (state: RootState) => state.auth.refreshToken;
export const selectRememberMe = (state: RootState) => state.auth.rememberMe;
export const selectStorageUnavailable = (state: RootState) => state.auth.storageUnavailable;

export default authSlice.reducer;
