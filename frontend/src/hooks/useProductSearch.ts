import { useRef, useState } from 'react'

import { ApiService } from '@/services/api'

type Product = {
  id: string
  [key: string]: unknown
}

const getProductsFromResponse = (response: unknown): Product[] => {
  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    response.data &&
    typeof response.data === 'object' &&
    'data' in response.data &&
    Array.isArray(response.data.data)
  ) {
    return response.data.data as Product[]
  }

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

export function useProductSearch() {
  const [products, setProducts] = useState<Product[]>([])
  const latestRequestRef = useRef(0)

  const loadProducts = async (searchTerm = '') => {
    const requestId = ++latestRequestRef.current

    try {
      const params: Record<string, string | boolean> = { isActive: true }
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
