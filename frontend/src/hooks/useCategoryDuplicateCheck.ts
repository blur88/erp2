import { useCallback } from 'react'

import { useLazyCheckCategoryDuplicateQuery } from '@/store/api/inventoryApi'

import { useFieldDuplicateCheck } from './useFieldDuplicateCheck'

interface CategoryDuplicateCheckResult {
  nameExists: boolean
  nameConflict?: {
    id: string
    name: string
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

interface UseCategoryDuplicateCheckProps {
  name?: string
  parentId?: string
  excludeId?: string
}

export const useCategoryDuplicateCheck = (props?: UseCategoryDuplicateCheckProps): UseCategoryDuplicateCheckReturn => {
  const [checkDuplicateRequest] = useLazyCheckCategoryDuplicateQuery()

  const nameCheckFn = useCallback(async (value: string, excludeId?: string) => {
    const result = await checkDuplicateRequest({
      name: value,
      parentId: props?.parentId,
      excludeId,
    }).unwrap()

    if (result.nameExists && result.nameConflict) {
      const conflict = result.nameConflict

      return {
        exists: true,
        message: `Category with name '${conflict.name}' already exists at this level`,
      }
    }

    return { exists: false }
  }, [checkDuplicateRequest, props?.parentId])

  const {
    isChecking,
    hasDuplicate: hasNameDuplicate,
    hasChecked: hasCheckedName,
    error: nameErrorMessage,
  } = useFieldDuplicateCheck(props?.name ?? '', nameCheckFn, {
    excludeId: props?.excludeId,
    skipCheck: !props?.name,
  })

  const checkDuplicate = useCallback(async (params: {
    name?: string
    parentId?: string
    excludeId?: string
  }): Promise<CategoryDuplicateCheckResult | null> => {
    if (!params.name) {
      return null
    }

    try {
      return await checkDuplicateRequest(params).unwrap()
    } catch {
      return null
    }
  }, [checkDuplicateRequest])

  return {
    checkDuplicate,
    isChecking,
    error: nameErrorMessage,
    nameError: nameErrorMessage ?? '',
    hasNameDuplicate,
    hasCheckedName,
  }
}
