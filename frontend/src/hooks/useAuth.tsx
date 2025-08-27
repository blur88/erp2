import React, { createContext, useContext, useCallback, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from './useRedux'
import {
  loginUser,
  registerUser,
  fetchUserProfile,
  logout,
  setTokens,
  setUser,
  setLoading,
  selectAuth,
} from '@/store/slices/authSlice'
import { authApi } from '@/services/authApi'
import type { LoginCredentials, RegisterData, User } from '@/types'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (credentials: LoginCredentials) => Promise<void>
  register: (userData: RegisterData) => Promise<void>
  logout: () => void
  updateProfile: (userData: Partial<User>) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  initialize: () => void
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useAppDispatch()
  const auth = useAppSelector(selectAuth)

  // Initialize auth state from localStorage
  const initialize = useCallback(async () => {
    const token = localStorage.getItem('token')
    const refreshToken = localStorage.getItem('refreshToken')
    const userData = localStorage.getItem('user')

    if (token && refreshToken && userData) {
      try {
        dispatch(setLoading(true))
        dispatch(setTokens({ token, refreshToken }))
        
        // Verify token by fetching user profile
        const result = await dispatch(fetchUserProfile())
        
        if (fetchUserProfile.fulfilled.match(result)) {
          // Token is valid, user data updated
          localStorage.setItem('user', JSON.stringify(result.payload))
        }
      } catch (error) {
        // Token invalid, clear storage
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
      } finally {
        dispatch(setLoading(false))
      }
    } else {
      dispatch(setLoading(false))
    }
  }, [dispatch])

  // Login
  const login = useCallback(async (credentials: LoginCredentials) => {
    const result = await dispatch(loginUser(credentials))
    
    if (loginUser.fulfilled.match(result)) {
      const { user, token, refreshToken } = result.payload
      localStorage.setItem('token', token)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('user', JSON.stringify(user))
    } else {
      throw new Error(result.payload as string)
    }
  }, [dispatch])

  // Register
  const register = useCallback(async (userData: RegisterData) => {
    const result = await dispatch(registerUser(userData))
    
    if (registerUser.fulfilled.match(result)) {
      const { user, token, refreshToken } = result.payload
      localStorage.setItem('token', token)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('user', JSON.stringify(user))
    } else {
      throw new Error(result.payload as string)
    }
  }, [dispatch])

  // Logout
  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (error) {
      // Ignore logout API errors
    } finally {
      dispatch(logout())
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
    }
  }, [dispatch])

  // Update profile
  const updateProfile = useCallback(async (userData: Partial<User>) => {
    try {
      const response = await authApi.updateProfile(userData)
      dispatch(setUser(response.data!))
      localStorage.setItem('user', JSON.stringify(response.data))
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update profile')
    }
  }, [dispatch])

  // Change password
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await authApi.changePassword(currentPassword, newPassword)
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to change password')
    }
  }, [])

  // Clear error
  const clearError = useCallback(() => {
    // This would be handled by the auth slice
  }, [])

  const value: AuthContextType = {
    user: auth.user,
    token: auth.token,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    login,
    register,
    logout: handleLogout,
    updateProfile,
    changePassword,
    initialize,
    clearError,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}