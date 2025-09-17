import { useState, useEffect, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { checkProductDuplicate } from '@/store/slices/inventorySlice'
import { AppDispatch } from '@/store'

interface DuplicateCheckResult {
  nameExists: boolean
  barcodeExists: boolean
  nameConflict?: {
    id: string
    name: string
    isDeleted: boolean
    barcode?: string
  }
  barcodeConflict?: {
    id: string
    name: string
    isDeleted: boolean
    barcode?: string
  }
}

interface UseDuplicateCheckReturn {
  checkDuplicate: (params: {
    name?: string
    barcode?: string
    excludeId?: string
  }) => Promise<DuplicateCheckResult | null>
  isChecking: boolean
  error: string | null
  nameError: string
  barcodeError: string
  hasNameDuplicate: boolean
  hasBarcodeDuplicate: boolean
}

export const useDuplicateCheck = (): UseDuplicateCheckReturn => {
  const dispatch = useDispatch<AppDispatch>()
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState('')
  const [barcodeError, setBarcodeError] = useState('')
  const [hasNameDuplicate, setHasNameDuplicate] = useState(false)
  const [hasBarcodeDuplicate, setHasBarcodeDuplicate] = useState(false)

  const checkDuplicate = useCallback(async (params: {
    name?: string
    barcode?: string
    excludeId?: string
  }): Promise<DuplicateCheckResult | null> => {
    if (!params.name && !params.barcode) {
      return null
    }

    setIsChecking(true)
    setError(null)
    setNameError('')
    setBarcodeError('')
    setHasNameDuplicate(false)
    setHasBarcodeDuplicate(false)

    try {
      const result = await dispatch(checkProductDuplicate(params)).unwrap()

      // Handle name duplicates
      if (result.nameExists && result.nameConflict) {
        const conflict = result.nameConflict
        if (conflict.isDeleted) {
          setNameError(
            `Product with name '${conflict.name}' was previously deleted. Please choose a different name or restore the deleted product.`
          )
        } else {
          setNameError(`Product with name '${conflict.name}' already exists`)
        }
        setHasNameDuplicate(true)
      }

      // Handle barcode duplicates
      if (result.barcodeExists && result.barcodeConflict) {
        const conflict = result.barcodeConflict
        if (conflict.isDeleted) {
          setBarcodeError(
            `Product with barcode '${conflict.barcode}' was previously deleted. Please choose a different barcode or restore the deleted product.`
          )
        } else {
          setBarcodeError(`Product with barcode '${conflict.barcode}' already exists`)
        }
        setHasBarcodeDuplicate(true)
      }

      return result
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to check for duplicates'
      setError(errorMessage)
      return null
    } finally {
      setIsChecking(false)
    }
  }, [dispatch])

  return {
    checkDuplicate,
    isChecking,
    error,
    nameError,
    barcodeError,
    hasNameDuplicate,
    hasBarcodeDuplicate,
  }
}