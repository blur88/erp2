import { describe, expect, it } from 'vitest'

import { auditLogApiSlice } from '@/store/api/auditLogApi'

describe('auditLogApiSlice', () => {
  it('defines expected endpoints', () => {
    expect(auditLogApiSlice.endpoints.getAuditLogs).toBeDefined()
    expect(auditLogApiSlice.endpoints.getAuditLogStatistics).toBeDefined()
    expect(auditLogApiSlice.endpoints.getAuditLogsByEntity).toBeDefined()
    expect(auditLogApiSlice.endpoints.getAuditLogsByUser).toBeDefined()
  })
})
