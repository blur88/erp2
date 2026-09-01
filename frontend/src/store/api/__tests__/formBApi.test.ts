import { accountingApi } from '../accountingApi'

describe('Form B endpoints', () => {
  it('requests the Form B route with the year', () => {
    const endpoint = (accountingApi.endpoints as any).getFormB
    expect(endpoint).toBeDefined()
    const built = endpoint.query({ year: 2025 })
    expect(built).toEqual({ url: '/accounting/profit-and-loss/form-b', params: { year: 2025 } })
  })

  it('requests the mapping list and writes one mapping by account id', () => {
    const list = (accountingApi.endpoints as any).getFormBMappings
    expect(list.query()).toEqual({ url: '/accounting/form-b-mappings' })

    const write = (accountingApi.endpoints as any).updateFormBMapping
    expect(write.query({ accountId: 'a1', category: 'RENT_LEASE' })).toEqual({
      url: '/accounting/form-b-mappings/a1',
      method: 'PUT',
      body: { category: 'RENT_LEASE' },
    })
  })

  // An explicit null is a CLEAR and must survive serialisation — dropping it
  // would turn a clear into a no-op.
  it('sends an explicit null category as the body', () => {
    const write = (accountingApi.endpoints as any).updateFormBMapping
    expect(write.query({ accountId: 'a1', category: null }).body).toEqual({ category: null })
  })

})
