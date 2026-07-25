export type GlobalSearchResultType =
  | 'page'
  | 'customer'
  | 'product'
  | 'transaction'
  | 'supplier'
  | 'invoice'
  | 'customer_payment';

export class GlobalSearchResultDto {
  type: GlobalSearchResultType;
  id?: string;
  label: string;
  description?: string;
  route: string;
  score?: number;
}
