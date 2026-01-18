import { ApiService } from './api'
import type { User, PaginatedResponse, QueryParams, UserRole } from '@/types'

interface UserQueryParams extends QueryParams {
  role?: UserRole | 'all'
  status?: 'active' | 'inactive' | 'suspended' | 'all'
}

interface CreateUserData {
  username: string
  email: string
  password: string
  firstName: string
  lastName: string
  phoneNumber?: string
  role: UserRole
  status: 'active' | 'inactive' | 'suspended'
  notes?: string
}

interface UpdateUserData {
  username?: string
  email?: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  role?: UserRole
  status?: 'active' | 'inactive' | 'suspended'
  notes?: string
}

interface UserStatistics {
  total: number
  active: number
  inactive: number
  locked: number
}

export const userManagementApi = {
  // Get users list with pagination and filters
  async getUsers(params?: UserQueryParams) {
    return ApiService.get<PaginatedResponse<User>>('users', { params })
  },

  // Get single user by ID
  async getUser(id: string) {
    return ApiService.get<User>(`users/${id}`)
  },

  // Create new user
  async createUser(userData: CreateUserData) {
    return ApiService.post<User>('users', userData)
  },

  // Update user
  async updateUser(id: string, userData: UpdateUserData) {
    return ApiService.patch<User>(`users/${id}`, userData)
  },

  // Deactivate user (soft delete)
  async deactivateUser(id: string) {
    return ApiService.delete(`users/${id}`)
  },

  // Unlock user account (admin endpoint)
  async unlockUser(id: string) {
    return ApiService.patch<User>(`users/${id}/admin`, { unlockAccount: true })
  },

  // Reset user password (admin endpoint)
  async resetPassword(id: string, newPassword: string) {
    return ApiService.patch<User>(`users/${id}/admin`, { password: newPassword })
  },

  // Get user statistics
  async getStatistics(): Promise<UserStatistics> {
    return ApiService.get<UserStatistics>('users/statistics')
  },
}
