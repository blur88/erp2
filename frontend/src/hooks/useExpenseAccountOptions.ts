import { useMemo } from 'react'

import {
  useGetAccountTreeQuery,
  useGetAccountingSettingsQuery,
} from '@/store/api/accountingApi'
import type { AccountTreeNode } from '@/types'

export interface ExpenseAccountOption {
  value: string
  label: string
}

/**
 * The single eligibility rule for expense accounts, shared by the Expenses list
 * filter and the New/Edit Expense selector (issue #1016 — they had diverged).
 *
 * Postable-only is enforced here; active-only and Expense-type-only come from the
 * account-tree query arguments in the hook below.
 *
 * `keepId` is the legacy escape hatch: an expense already booked to the COGS
 * account keeps that account selectable inside its own edit form, so opening the
 * row does not silently blank the field.
 */
export function buildEligibleExpenseAccountOptions(
  tree: AccountTreeNode[],
  cogsAccountId: string | null | undefined,
  keepId?: string | null,
): ExpenseAccountOption[] {
  const options: ExpenseAccountOption[] = []

  const flatten = (nodes: AccountTreeNode[]) => {
    for (const node of nodes) {
      if (node.isPostable) {
        options.push({ value: node.id, label: `${node.code} ${node.name}` })
      }
      // Recurse regardless: a non-postable parent still holds postable children.
      if (node.children?.length) flatten(node.children)
    }
  }
  flatten(tree)

  if (!cogsAccountId) return options
  return options.filter(
    (option) => option.value !== cogsAccountId || option.value === keepId,
  )
}

/**
 * Owns both data dependencies behind the eligibility rule so no caller can apply
 * it with settings missing — the exact defect behind #1016.
 *
 * Readiness is "both queries succeeded", never `!isLoading`: after a failure
 * `isLoading` is false while no trustworthy data exists, and treating that as
 * resolved would either expose COGS or clear a valid filter. Until ready, the
 * option list is empty rather than partially filtered, so COGS cannot flash in.
 */
export function useExpenseAccountOptions(
  args?: { keepId?: string | null },
): {
  options: ExpenseAccountOption[]
  isLoading: boolean
  isReady: boolean
  isError: boolean
} {
  const keepId = args?.keepId ?? null

  const {
    data: accountTreeData,
    isLoading: treeLoading,
    isError: treeError,
  } = useGetAccountTreeQuery({ type: 'Expense', isActive: true })

  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
  } = useGetAccountingSettingsQuery()

  const isLoading = !!treeLoading || !!settingsLoading
  const isError = !!treeError || !!settingsError
  const isReady = !isLoading && !isError && !!accountTreeData && !!settings

  const options = useMemo(
    () =>
      isReady
        ? buildEligibleExpenseAccountOptions(
            accountTreeData as AccountTreeNode[],
            settings?.cogsAccountId,
            keepId,
          )
        : [],
    [isReady, accountTreeData, settings?.cogsAccountId, keepId],
  )

  return { options, isLoading, isReady, isError }
}