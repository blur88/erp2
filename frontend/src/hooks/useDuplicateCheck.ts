import { useState, useEffect, useCallback } from 'react'
import { useLazyCheckProductDuplicateQuery } from '@/store/api/inventoryApi'

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
  hasCheckedName: boolean
  hasCheckedBarcode: boolean
}

export const useDuplicateCheck = (): UseDuplicateCheckReturn => {
  const [checkDuplicateRequest] = useLazyCheckProductDuplicateQuery()
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState('')
  const [barcodeError, setBarcodeError] = useState('')
  const [hasNameDuplicate, setHasNameDuplicate] = useState(false)
  const [hasBarcodeDuplicate, setHasBarcodeDuplicate] = useState(false)
  const [hasCheckedName, setHasCheckedName] = useState(false)
  const [hasCheckedBarcode, setHasCheckedBarcode] = useState(false)

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
    setHasCheckedName(false)
    setHasCheckedBarcode(false)

    try {
      const result = await checkDuplicateRequest(params).unwrap()

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

      // Mark as checked after processing results
      if (params.name) {
        setHasCheckedName(true)
      }
      if (params.barcode) {
        setHasCheckedBarcode(true)
      }

      return result
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to check for duplicates'
      setError(errorMessage)
      return null
    } finally {
      setIsChecking(false)
    }
  }, [checkDuplicateRequest])

  return {
    checkDuplicate,
    isChecking,
    error,
    nameError,
    barcodeError,
    hasNameDuplicate,
    hasBarcodeDuplicate,
    hasCheckedName,
    hasCheckedBarcode,
  }
}
