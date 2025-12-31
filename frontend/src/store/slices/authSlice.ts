import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/services/authApi';

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
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  expiresIn: number;
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
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await authApi.login(credentials);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (data: RegisterData, { rejectWithValue }) => {
    try {
      const response = await authApi.register(data);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Registration failed');
    }
  }
);

export const refreshAccessToken = createAsyncThunk(
  'auth/refreshToken',
  async (refreshToken: string, { rejectWithValue }) => {
    try {
      const response = await authApi.refreshToken(refreshToken);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Token refresh failed');
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async (refreshToken: string, { rejectWithValue }) => {
    try {
      await authApi.logout(refreshToken);
      return null;
    } catch (error: any) {
      // Even if logout fails on server, we still clear local state
      return null;
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
    setCredentials: (state, action: PayloadAction<AuthResponse>) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.error = null;
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
    },
    clearAuth: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
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
      .addCase(login.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload.user;
          state.accessToken = action.payload.accessToken;
          state.refreshToken = action.payload.refreshToken;
          state.isAuthenticated = true;
          state.loading = false;
          state.error = null;
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    // Register
    builder
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload.user;
          state.accessToken = action.payload.accessToken;
          state.refreshToken = action.payload.refreshToken;
          state.isAuthenticated = true;
          state.loading = false;
          state.error = null;
        }
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    // Refresh token
    builder
      .addCase(refreshAccessToken.fulfilled, (state, action) => {
        if (action.payload) {
          state.accessToken = action.payload.accessToken;
          state.refreshToken = action.payload.refreshToken;
          state.user = action.payload.user;
        }
      })
      .addCase(refreshAccessToken.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
      });

    // Logout
    builder.addCase(logout.fulfilled, (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
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
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
      });

    // Change password (logs out all sessions)
    builder
      .addCase(changePassword.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.loading = false;
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setCredentials, setAccessToken, clearAuth, clearError } = authSlice.actions;

// Selectors
export const selectCurrentUser = (state: any) => state.auth?.user;
export const selectIsAuthenticated = (state: any) => state.auth?.isAuthenticated || false;
export const selectAccessToken = (state: any) => state.auth?.accessToken;
export const selectRefreshToken = (state: any) => state.auth?.refreshToken;
export const selectAuthLoading = (state: any) => state.auth?.loading || false;
export const selectAuthError = (state: any) => state.auth?.error;

export default authSlice.reducer;
