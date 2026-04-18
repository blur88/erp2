import { useCallback } from 'react'

import { useLazyCheckProductDuplicateQuery } from '@/store/api/inventoryApi'

import { useFieldDuplicateCheck } from './useFieldDuplicateCheck'

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

interface UseDuplicateCheckProps {
  name?: string
  barcode?: string
  excludeId?: string
}

export const useDuplicateCheck = (props?: UseDuplicateCheckProps): UseDuplicateCheckReturn => {
  const [checkDuplicateRequest] = useLazyCheckProductDuplicateQuery()

  const nameCheckFn = useCallback(async (value: string, excludeId?: string) => {
    const result = await checkDuplicateRequest({ name: value, excludeId }).unwrap()

    if (result.nameExists && result.nameConflict) {
      const conflict = result.nameConflict

      return {
        exists: true,
        message: conflict.isDeleted
          ? `Product with name '${conflict.name}' was previously deleted. Please choose a different name or restore the deleted product.`
          : `Product with name '${conflict.name}' already exists`,
      }
    }

    return { exists: false }
  }, [checkDuplicateRequest])

  const barcodeCheckFn = useCallback(async (value: string, excludeId?: string) => {
    const result = await checkDuplicateRequest({ barcode: value, excludeId }).unwrap()

    if (result.barcodeExists && result.barcodeConflict) {
      const conflict = result.barcodeConflict

      return {
        exists: true,
        message: conflict.isDeleted
          ? `Product with barcode '${conflict.barcode}' was previously deleted. Please choose a different barcode or restore the deleted product.`
          : `Product with barcode '${conflict.barcode}' already exists`,
      }
    }

    return { exists: false }
  }, [checkDuplicateRequest])

  const {
    isChecking: isCheckingName,
    hasDuplicate: hasNameDuplicate,
    hasChecked: hasCheckedName,
    error: nameErrorMessage,
  } = useFieldDuplicateCheck(props?.name ?? '', nameCheckFn, {
    excludeId: props?.excludeId,
    skipCheck: !props?.name,
  })

  const {
    isChecking: isCheckingBarcode,
    hasDuplicate: hasBarcodeDuplicate,
    hasChecked: hasCheckedBarcode,
    error: barcodeErrorMessage,
  } = useFieldDuplicateCheck(props?.barcode ?? '', barcodeCheckFn, {
    excludeId: props?.excludeId,
    minLength: 1,
    skipCheck: !props?.barcode,
  })

  const checkDuplicate = useCallback(async (params: {
    name?: string
    barcode?: string
    excludeId?: string
  }): Promise<DuplicateCheckResult | null> => {
    if (!params.name && !params.barcode) {
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
    isChecking: isCheckingName || isCheckingBarcode,
    error: nameErrorMessage ?? barcodeErrorMessage,
    nameError: nameErrorMessage ?? '',
    barcodeError: barcodeErrorMessage ?? '',
    hasNameDuplicate,
    hasBarcodeDuplicate,
    hasCheckedName,
    hasCheckedBarcode,
  }
}
