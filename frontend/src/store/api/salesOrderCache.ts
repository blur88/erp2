import { salesApiSlice } from './salesApi'

import type { AppDispatch, RootState } from '@/store'
import type { PaginatedResponse, SalesOrder } from '@/types'

export function patchSalesOrderCaches(
  dispatch: AppDispatch,
  getState: () => RootState,
  order: SalesOrder,
): void {
  const cachedListArgs = salesApiSlice.util.selectCachedArgsForQuery(
    getState() as any,
    'getSalesOrders',
  ) as Record<string, unknown>[]

  for (const args of cachedListArgs) {
    ;(dispatch as any)(
      salesApiSlice.util.updateQueryData('getSalesOrders', args, (draft: PaginatedResponse<SalesOrder>) => {
        const index = draft.data.findIndex((item) => item.id === order.id)
        if (index >= 0) {
          draft.data[index] = {
            ...draft.data[index],
            ...order,
          }
        }
      }),
    )
  }

  ;(dispatch as any)(
    salesApiSlice.util.updateQueryData('getSalesOrder', order.id, (draft: SalesOrder) => {
      Object.assign(draft, order)
    }),
  )
}
