import { useCallback, useMemo, useState } from 'react'

import { PAGINATION } from '@/constants/tableStyles'

export function usePagination(initialLimit: number = PAGINATION.defaultPageSize) {
  const [page, setPage] = useState(1)
  const [limit, setLimitState] = useState(initialLimit)

  const setLimit = useCallback((l: number) => {
    setLimitState(l)
    setPage(1)
  }, [])

  const reset = useCallback(() => setPage(1), [])

  const paginationProps = useMemo(
    () => ({ page, limit, onPageChange: setPage, onLimitChange: setLimit }),
    [page, limit, setLimit],
  )

  return { page, limit, setPage, setLimit, reset, paginationProps }
}
