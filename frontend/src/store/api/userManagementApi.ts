import { createApi } from '@reduxjs/toolkit/query/react'

import type { PaginatedResponse, QueryParams, User, UserRole } from '@/types'

import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'

interface UserQueryParams extends QueryParams {
  role?: UserRole | 'all'
  status?: 'active' | 'inactive' | 'suspended' | 'all'
}

interface CreateUserData {
  username: string
  email?: string | null
  password: string
  firstName?: string | null
  lastName?: string | null
  phoneNumber?: string | null
  role: UserRole
  status: 'active' | 'inactive' | 'suspended'
  notes?: string | null
}

interface UpdateUserData {
  username?: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phoneNumber?: string | null
  role?: UserRole
  status?: 'active' | 'inactive' | 'suspended'
  notes?: string | null
  password?: string
}

interface UserStatistics {
  total: number
  active: number
  inactive: number
  locked: number
}

export const userManagementApiSlice = createApi({
  reducerPath: 'userManagementApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['User', 'UserStats'],
  endpoints: (builder) => ({
    getUsers: builder.query<PaginatedResponse<User>, UserQueryParams | undefined>({
      query: (params) => ({ url: '/users', params: (params ?? {}) as Record<string, unknown> }),
      transformResponse: normalizePaginated<User>,
      providesTags: ['User'],
    }),
    getUser: builder.query<User, string>({
      query: (id) => ({ url: `/users/${id}` }),
      transformResponse: normalizeSingle<User>,
      providesTags: (_result, _error, id) => [{ type: 'User', id }],
    }),
    createUser: builder.mutation<User, CreateUserData>({
      query: (body) => ({ url: '/users', method: 'POST', data: body }),
      transformResponse: normalizeSingle<User>,
      invalidatesTags: ['User', 'UserStats'],
    }),
    updateUser: builder.mutation<User, { id: string; data: UpdateUserData }>({
      query: ({ id, data }) => ({ url: `/users/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<User>,
      invalidatesTags: ['User', 'UserStats'],
    }),
    deactivateUser: builder.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['User', 'UserStats'],
    }),
    unlockUser: builder.mutation<User, string>({
      query: (id) => ({ url: `/users/${id}/admin`, method: 'PATCH', data: { unlockAccount: true } }),
      transformResponse: normalizeSingle<User>,
      invalidatesTags: ['User', 'UserStats'],
    }),
    resetPassword: builder.mutation<User, { id: string; newPassword: string }>({
      query: ({ id, newPassword }) => ({ url: `/users/${id}/admin`, method: 'PATCH', data: { password: newPassword } }),
      transformResponse: normalizeSingle<User>,
      invalidatesTags: ['User'],
    }),
    getStatistics: builder.query<UserStatistics, void>({
      query: () => ({ url: '/users/statistics' }),
      providesTags: ['UserStats'],
    }),
  }),
})

export const {
  useGetUsersQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeactivateUserMutation,
  useUnlockUserMutation,
  useResetPasswordMutation,
  useGetStatisticsQuery,
} = userManagementApiSlice
