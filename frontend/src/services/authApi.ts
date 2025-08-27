import { ApiService } from './api'
import type { LoginCredentials, RegisterData, User } from '@/types'

export const authApi = {
  // Authentication
  async login(credentials: LoginCredentials) {
    return ApiService.post<{
      user: User
      token: string
      refreshToken: string
    }>('/auth/login', credentials)
  },

  async register(userData: RegisterData) {
    return ApiService.post<{
      user: User
      token: string
      refreshToken: string
    }>('/auth/register', userData)
  },

  async logout() {
    return ApiService.post('/auth/logout')
  },

  async refreshToken(refreshToken: string) {
    return ApiService.post<{
      token: string
      refreshToken: string
    }>('/auth/refresh', { refreshToken })
  },

  // Password management
  async forgotPassword(email: string) {
    return ApiService.post('/auth/forgot-password', { email })
  },

  async resetPassword(token: string, password: string) {
    return ApiService.post('/auth/reset-password', { token, password })
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return ApiService.post('/auth/change-password', {
      currentPassword,
      newPassword,
    })
  },

  // User profile
  async getProfile() {
    return ApiService.get<User>('/auth/profile')
  },

  async updateProfile(userData: Partial<User>) {
    return ApiService.put<User>('/auth/profile', userData)
  },

  // Email verification
  async sendVerificationEmail() {
    return ApiService.post('/auth/send-verification')
  },

  async verifyEmail(token: string) {
    return ApiService.post('/auth/verify-email', { token })
  },

  // Two-factor authentication
  async enable2FA() {
    return ApiService.post<{ qrCode: string; secret: string }>('/auth/2fa/enable')
  },

  async verify2FA(token: string) {
    return ApiService.post('/auth/2fa/verify', { token })
  },

  async disable2FA(password: string) {
    return ApiService.post('/auth/2fa/disable', { password })
  },

  // Session management
  async getSessions() {
    return ApiService.get<Array<{
      id: string
      device: string
      location: string
      lastActive: Date
      current: boolean
    }>>('/auth/sessions')
  },

  async revokeSession(sessionId: string) {
    return ApiService.delete(`/auth/sessions/${sessionId}`)
  },

  async revokeAllSessions() {
    return ApiService.post('/auth/revoke-all-sessions')
  },
}