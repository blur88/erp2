export type GlobalSearchResultType =
  | 'page'
  | 'customer'
  | 'product'
  | 'transaction'
  | 'supplier'
  | 'customer_payment'
  | 'vendor_payment'

export interface GlobalSearchResultDto {
  type: GlobalSearchResultType
  id?: string
  label: string
  description?: string
  route: string
  score?: number
}

export interface GlobalSearchResponse {
  query: string
  results: GlobalSearchResultDto[]
}
