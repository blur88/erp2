import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/services/authApi';
import { SessionChangedElsewhereError } from '@/session/runtime';
import type { RootState } from '@/store';
import { StorageTimeoutError, StorageUnavailableError } from '@/session/types';
import type { ActiveSession, AuthUser, LoginCredentials } from '@/session/types';
import { getErrorMessage } from '@/utils/errorMessage';

// Defined with the session record they are stored in; re-exported for the
// existing imports from this slice.
export type { AuthUser, LoginCredentials };

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  expiresIn: number;
  requiresPasswordChange?: boolean;
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
  // The start-up read of the session record timed out: not signed-out, and
  // storage not found broken. Written only from the session runtime's events.
  storageWaiting: boolean;
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
  storageWaiting: false,
};

// The message shown on the login form: the server's own wording when the
// response carries one (wrong password, locked account, 426 reload required),
// otherwise a sentence for the failures that never reach the server.
const loginErrorMessage = (error: any): string => {
  const serverMessage = getErrorMessage(error?.response?.data?.message, '');
  if (serverMessage) return serverMessage;
  if (error instanceof SessionChangedElsewhereError) {
    return 'The session changed in another tab. Sign in again.';
  }
  if (error instanceof StorageUnavailableError) {
    return 'Session storage is unavailable in this browser. Allow site data for this address, then reload.';
  }
  if (error instanceof StorageTimeoutError) {
    return 'Session storage did not respond in time. Try again.';
  }
  return 'Login failed';
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
      return rejectWithValue(loginErrorMessage(error));
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
      action: PayloadAction<{
        generation: number;
        accessToken: string;
        accessTokenExpiresAt: number;
        refreshToken: string;
      }>
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.generation = action.payload.generation;
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
    },
    storageWaiting: (state, action: PayloadAction<boolean>) => {
      state.storageWaiting = action.payload;
    },
    storageUnavailable: (state) => {
      state.storageUnavailable = true;
      state.storageWaiting = false;
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
  storageWaiting,
  clearError,
} = authSlice.actions;

export const selectCurrentUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectAccessToken = (state: RootState) => state.auth.accessToken;
export const selectRefreshToken = (state: RootState) => state.auth.refreshToken;
export const selectRememberMe = (state: RootState) => state.auth.rememberMe;
export const selectStorageUnavailable = (state: RootState) => state.auth.storageUnavailable;
export const selectStorageWaiting = (state: RootState) => state.auth.storageWaiting;

export default authSlice.reducer;
