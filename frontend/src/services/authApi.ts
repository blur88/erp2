import axios, { AxiosResponse } from 'axios';
import type {
  LoginCredentials,
  RegisterData,
  ChangePasswordData,
  AuthResponse,
  AuthUser,
} from '@/store/slices/authSlice';

// Get API base URL dynamically
const getApiBaseUrl = () => {
  const envUrl = (window as any).__ENV__?.VITE_API_BASE_URL;
  if (envUrl) return envUrl;

  if (window.location.origin !== 'http://localhost:3000') {
    return '/api';
  }

  return 'http://localhost:3001/api';
};

// Create a dedicated axios instance for auth (no interceptors to avoid circular dependency)
const authAxios = axios.create({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Set baseURL for each request
authAxios.interceptors.request.use((config) => {
  if (!config.baseURL) {
    config.baseURL = getApiBaseUrl();
  }
  return config;
});

export const authApi = {
  /**
   * Login user with username/email and password
   */
  login: async (credentials: LoginCredentials): Promise<AxiosResponse<AuthResponse>> => {
    return await authAxios.post<AuthResponse>('/auth/login', credentials);
  },

  /**
   * Register new user
   */
  register: async (data: RegisterData): Promise<AxiosResponse<AuthResponse>> => {
    return await authAxios.post<AuthResponse>('/auth/register', data);
  },

  /**
   * Refresh access token using refresh token
   */
  refreshToken: async (refreshToken: string): Promise<AxiosResponse<AuthResponse>> => {
    return await authAxios.post<AuthResponse>('/auth/refresh', { refreshToken });
  },

  /**
   * Logout user and invalidate refresh token
   */
  logout: async (refreshToken: string): Promise<AxiosResponse<void>> => {
    return await authAxios.post<void>('/auth/logout', { refreshToken });
  },

  /**
   * Get current authenticated user
   * Note: This requires Authorization header, so it will be called through main api service
   */
  getCurrentUser: async (): Promise<AxiosResponse<AuthUser>> => {
    // This will be enhanced in api.ts with auth interceptor
    return await authAxios.get<AuthUser>('/auth/me');
  },

  /**
   * Change password for current user
   */
  changePassword: async (data: ChangePasswordData): Promise<AxiosResponse<void>> => {
    // This will be enhanced in api.ts with auth interceptor
    return await authAxios.patch<void>('/auth/change-password', data);
  },
};
