import { describe, it, expect } from 'vitest'
import { printSettingsApiSlice } from '../printSettingsApi'

describe('printSettingsApiSlice', () => {
  it('has the correct reducerPath', () => {
    expect(printSettingsApiSlice.reducerPath).toBe('printSettingsApi')
  })

  it('exports query hooks', () => {
    expect(typeof printSettingsApiSlice.endpoints.getPrintSettings).toBe('object')
  })

  it('exports mutation hooks', () => {
    expect(typeof printSettingsApiSlice.endpoints.updatePrintSettings).toBe('object')
    expect(typeof printSettingsApiSlice.endpoints.importFromCompany).toBe('object')
    expect(typeof printSettingsApiSlice.endpoints.uploadPrintLogo).toBe('object')
  })
})
