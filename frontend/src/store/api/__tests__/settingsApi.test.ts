import { describe, it, expect } from 'vitest'
import { settingsApiSlice } from '../settingsApi'

describe('settingsApiSlice', () => {
  it('has the correct reducerPath', () => {
    expect(settingsApiSlice.reducerPath).toBe('settingsApi')
  })

  it('exports query hooks', () => {
    expect(typeof settingsApiSlice.endpoints.getCompanySettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getRegionalSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getDocumentNumberSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getDefaultCurrency).toBe('object')
  })

  it('exports mutation hooks', () => {
    expect(typeof settingsApiSlice.endpoints.updateCompanySettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.updateRegionalSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.updateDocumentNumberSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.uploadLogo).toBe('object')
    expect(typeof settingsApiSlice.endpoints.deleteLogo).toBe('object')
  })
})
