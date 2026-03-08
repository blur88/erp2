import { describe, expect, it } from 'vitest'

import { userManagementApiSlice } from '@/store/api/userManagementApi'

describe('userManagementApiSlice', () => {
  it('defines expected user management endpoints', () => {
    expect(userManagementApiSlice.endpoints.getUsers).toBeDefined()
    expect(userManagementApiSlice.endpoints.getUser).toBeDefined()
    expect(userManagementApiSlice.endpoints.createUser).toBeDefined()
    expect(userManagementApiSlice.endpoints.updateUser).toBeDefined()
    expect(userManagementApiSlice.endpoints.deactivateUser).toBeDefined()
    expect(userManagementApiSlice.endpoints.unlockUser).toBeDefined()
    expect(userManagementApiSlice.endpoints.resetPassword).toBeDefined()
    expect(userManagementApiSlice.endpoints.getStatistics).toBeDefined()
  })
})
