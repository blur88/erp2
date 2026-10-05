import { AxiosResponse } from 'axios';
import type {
  ChangePasswordData,
  AuthUser,
} from '@/store/slices/authSlice';

// Get API base URL dynamically
export const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return '/api';
  const envUrl = (window as any).__ENV__?.VITE_API_BASE_URL;
  if (envUrl) return envUrl;

  if (window.location.origin !== 'http://localhost:3000') {
    return '/api';
  }

  return 'http://localhost:3001/api';
};

export const authApi = {
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
    const apiInstance = (await import('./api')).default;
    return await apiInstance.get<{ showDefaultCredentials: boolean }>('/auth/show-default-credentials');
  },
};
