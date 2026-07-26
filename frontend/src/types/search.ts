export type GlobalSearchResultType =
  | 'page'
  | 'customer'
  | 'product'
  | 'transaction'
  | 'supplier'

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
