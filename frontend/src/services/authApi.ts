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
   * Note: This requires Authorization header via the main api instance
   */
  getCurrentUser: async (): Promise<AxiosResponse<AuthUser>> => {
    // Import api (axios instance) dynamically to avoid circular dependency
    // The default export is the configured axios instance with auth interceptors
    const apiInstance = (await import('./api')).default;
    // axios.get returns AxiosResponse, which matches our return type
    return await apiInstance.get<AuthUser>('/auth/me');
  },

  /**
   * Change password for current user
   * Note: This requires Authorization header via the main api instance
   */
  changePassword: async (data: ChangePasswordData): Promise<AxiosResponse<void>> => {
    // Import api (axios instance) dynamically to avoid circular dependency
    const apiInstance = (await import('./api')).default;
    // axios.patch returns AxiosResponse, which matches our return type
    return await apiInstance.patch<void>('/auth/change-password', data);
  },

  /**
   * Check if default credentials should be shown
   * Returns true if admin user still requires password change
   */
  shouldShowDefaultCredentials: async (): Promise<AxiosResponse<{ showDefaultCredentials: boolean }>> => {
    return await authAxios.get<{ showDefaultCredentials: boolean }>('/auth/show-default-credentials');
  },
};
