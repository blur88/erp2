import { useRef, useState } from 'react'

import { ApiService } from '@/services/api'

type Product = {
  id: string
  [key: string]: unknown
}

const getProductsFromResponse = (response: unknown): Product[] => {
  // ApiService.get already strips the Axios wrapper and returns response.data,
  // so what arrives here is the backend body: { data: Product[], meta: {...} }.
  // The correct path is therefore response.data (one level, not two).
  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray(response.data)
  ) {
    return response.data as Product[]
  }

  return []
}

export function useProductSearch({
  onlyActive = false,
  type,
}: { onlyActive?: boolean; type?: string } = {}) {
  const [products, setProducts] = useState<Product[]>([])
  const latestRequestRef = useRef(0)

  const loadProducts = async (searchTerm = '') => {
    const requestId = ++latestRequestRef.current

    try {
      // sortBy/sortOrder are explicit rather than relying on backend defaults
      // so this keeps working if the backend default ever changes.
      const params: Record<string, string> = {
        sortBy: 'name',
        sortOrder: 'ASC',
      }

      if (onlyActive) {
        params.isActive = 'true'
      }

      // Filtering by type server-side keeps callers that only care about one
      // product kind (e.g. owner-equity stock drawings) from paging through
      // the whole catalogue client-side. Issue #1086.
      if (type) {
        params.type = type
      }

      const trimmedSearchTerm = searchTerm.trim()

      if (trimmedSearchTerm.length >= 1) {
        params.search = trimmedSearchTerm
      }

      const response = await ApiService.get('/inventory/products', { params })

      if (requestId !== latestRequestRef.current) {
        return
      }

      setProducts(getProductsFromResponse(response))
    } catch (error) {
      console.error('Error loading products:', error)
    }
  }

  const seedProducts = (incoming: Product[]) => {
    // Invalidate older in-flight searches so edit-mode hydration is not overwritten
    // when the initial product request resolves after seeding selected products.
    latestRequestRef.current += 1

    setProducts((previousProducts) => {
      const existingIds = new Set(previousProducts.map((product) => product.id))
      const productsToAdd = incoming.filter((product) => !existingIds.has(product.id))

      return [...previousProducts, ...productsToAdd]
    })
  }

  return { products, loadProducts, seedProducts }
}
