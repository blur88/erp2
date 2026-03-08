import { useState, useEffect, useCallback } from 'react'
import { useLazyCheckCategoryDuplicateQuery } from '@/store/api/inventoryApi'

interface CategoryDuplicateCheckResult {
  nameExists: boolean
  nameConflict?: {
    id: string
    name: string
    isDeleted: boolean
    parentId?: string
  }
}

interface UseCategoryDuplicateCheckReturn {
  checkDuplicate: (params: {
    name?: string
    parentId?: string
    excludeId?: string
  }) => Promise<CategoryDuplicateCheckResult | null>
  isChecking: boolean
  error: string | null
  nameError: string
  hasNameDuplicate: boolean
  hasCheckedName: boolean
}

export const useCategoryDuplicateCheck = (): UseCategoryDuplicateCheckReturn => {
  const [checkDuplicateRequest] = useLazyCheckCategoryDuplicateQuery()
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState('')
  const [hasNameDuplicate, setHasNameDuplicate] = useState(false)
  const [hasCheckedName, setHasCheckedName] = useState(false)

  const checkDuplicate = useCallback(async (params: {
    name?: string
    parentId?: string
    excludeId?: string
  }): Promise<CategoryDuplicateCheckResult | null> => {
    if (!params.name) {
      return null
    }

    setIsChecking(true)
    setError(null)
    setNameError('')
    setHasNameDuplicate(false)
    setHasCheckedName(false)

    try {
      const result = await checkDuplicateRequest(params).unwrap()

      // Handle name duplicates
      if (result.nameExists && result.nameConflict) {
        const conflict = result.nameConflict
        if (conflict.isDeleted) {
          setNameError(
            `Category with name '${conflict.name}' was previously deleted. Please choose a different name or restore the deleted category.`
          )
        } else {
          setNameError(`Category with name '${conflict.name}' already exists at this level`)
        }
        setHasNameDuplicate(true)
      }

      // Mark as checked after processing results
      if (params.name) {
        setHasCheckedName(true)
      }

      return result
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to check for duplicate category'
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
    hasNameDuplicate,
    hasCheckedName,
  }
}
