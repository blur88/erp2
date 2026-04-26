import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'

import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'

export interface UseEntityWorkspaceConfig<T extends { id: string }> {
  entities: T[]
  selectedEntity: T | null
  selectEntity: (entity: T | null) => void
  refetch: () => void
  navigate: NavigateFunction
  routes: {
    create: string
    edit: (id: string) => string
  }
  notifications: {
    showSuccess: (message: string) => void
    showError: (message: string) => void
  }
  deleteMutation: (id: string) => Promise<void>
  onEnter?: () => void
  onEscape?: () => void
  highlightParam?: string
  locationStateHighlightKey?: string
}

export interface EntityWorkspaceReturn<T extends { id: string }> {
  focusedIndex: number
  setFocusedIndex: (index: number) => void
  listRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  deleteConfirmOpen: boolean
  setDeleteConfirmOpen: (open: boolean) => void
  deletedEntitiesDialogOpen: boolean
  setDeletedEntitiesDialogOpen: (open: boolean) => void
  setShouldPreserveSearchFocus: (value: boolean) => void
  handleSelect: (entity: T) => void
  handleDelete: () => Promise<void>
  handleCancelDelete: () => void
  handleNavigateUp: () => void
  handleNavigateDown: () => void
  handleEnterAction: () => void
  handleEscapeAction: () => void
  handlePageUpNavigation: () => void
  handlePageDownNavigation: () => void
  handleNavigateToFirst: () => void
  handleNavigateToLast: () => void
}

export function useEntityWorkspace<T extends { id: string }>(
  config: UseEntityWorkspaceConfig<T>,
): EntityWorkspaceReturn<T> {
  const {
    entities,
    selectedEntity,
    selectEntity,
    refetch,
    navigate,
    routes,
    notifications,
    deleteMutation,
    onEnter,
    onEscape,
    highlightParam,
  } = config

  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletedEntitiesDialogOpen, setDeletedEntitiesDialogOpen] = useState(false)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()

  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hasAutoSelected = useRef(false)
  const highlightConsumedRef = useRef<string | null>(null)

  useEffect(() => {
    if (entities.length === 0) {
      hasAutoSelected.current = false
      setFocusedIndex(-1)
      selectEntity(null)
      return
    }

    if (!selectedEntity && focusedIndex === -1 && !hasAutoSelected.current) {
      hasAutoSelected.current = true
      selectEntity(entities[0])
    }
  }, [entities, focusedIndex, selectedEntity, selectEntity])

  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) {
      return
    }

    const focusedRow = listRef.current.querySelector<HTMLElement>(`[data-index="${focusedIndex}"]`)
    if (focusedRow && typeof focusedRow.scrollIntoView === 'function') {
      focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [focusedIndex])

  useEffect(() => {
    if (
      shouldPreserveSearchFocus &&
      searchInputRef.current &&
      document.activeElement !== searchInputRef.current
    ) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
        setShouldPreserveSearchFocus(false)
      }, 0)

      return () => clearTimeout(timer)
    }

    if (shouldPreserveSearchFocus) {
      setShouldPreserveSearchFocus(false)
    }
  }, [shouldPreserveSearchFocus])

  useEffect(() => {
    if (!highlightParam || entities.length === 0) {
      return
    }

    const highlightId = searchParams.get(highlightParam)
    if (!highlightId || highlightConsumedRef.current === highlightId) {
      return
    }

    const index = entities.findIndex((e) => e.id === highlightId)
    if (index < 0) {
      return
    }

    highlightConsumedRef.current = highlightId
    setFocusedIndex(index)
    selectEntity(entities[index])
    setSearchParams(
      (prev) => {
        prev.delete(highlightParam)
        return prev
      },
      { replace: true },
    )
  }, [entities, highlightParam, searchParams, selectEntity, setSearchParams])

  const selectAtIndex = useCallback((index: number) => {
    const entity = entities[index]

    if (!entity) {
      return
    }

    setFocusedIndex(index)
    selectEntity(entity)
  }, [entities, selectEntity])

  const handleSelect = useCallback((entity: T) => {
    const index = entities.findIndex((candidate) => candidate.id === entity.id)

    setFocusedIndex(index)
    selectEntity(entity)
  }, [entities, selectEntity])

  const handleNavigateUp = useCallback(() => {
    if (focusedIndex > 0) {
      selectAtIndex(focusedIndex - 1)
    }
  }, [focusedIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedIndex < entities.length - 1) {
      selectAtIndex(focusedIndex + 1)
    }
  }, [entities.length, focusedIndex, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (entities.length > 0) {
      selectAtIndex(0)
    }
  }, [entities.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (entities.length > 0) {
      selectAtIndex(entities.length - 1)
    }
  }, [entities.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const nextIndex = Math.max(0, focusedIndex - 20)

    if (entities[nextIndex]) {
      selectAtIndex(nextIndex)
    }
  }, [entities, focusedIndex, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const nextIndex = Math.min(entities.length - 1, focusedIndex + 20)

    if (entities[nextIndex]) {
      selectAtIndex(nextIndex)
    }
  }, [entities, focusedIndex, selectAtIndex])

  const handleEnterAction = useCallback(() => {
    if (onEnter) {
      onEnter()
      return
    }

    if (focusedIndex >= 0 && entities[focusedIndex]) {
      navigate(routes.edit(entities[focusedIndex].id))
    }
  }, [entities, focusedIndex, navigate, onEnter, routes])

  const handleEscapeAction = useCallback(() => {
    if (onEscape) {
      onEscape()
      return
    }

    setFocusedIndex(-1)
    selectEntity(null)
    setDeleteConfirmOpen(false)
    setDeletedEntitiesDialogOpen(false)
  }, [onEscape, selectEntity])

  const handleDelete = useCallback(async () => {
    if (!selectedEntity) {
      return
    }

    try {
      await deleteMutation(selectedEntity.id)
      notifications.showSuccess('Deleted successfully')
      selectEntity(null)
      setFocusedIndex(-1)
      setDeleteConfirmOpen(false)
      refetch()
    } catch (error: any) {
      const message = error?.data?.message || error?.message || 'An unexpected error occurred.'
      notifications.showError(message)
    }
  }, [deleteMutation, notifications, refetch, selectEntity, selectedEntity])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
  }, [])

  useKeyboardShortcuts({
    onSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    },
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
    onEnter: handleEnterAction,
    onPageUp: handlePageUpNavigation,
    onPageDown: handlePageDownNavigation,
    onHome: handleNavigateToFirst,
    onEnd: handleNavigateToLast,
    onEscape: handleEscapeAction,
  })

  return {
    focusedIndex,
    setFocusedIndex,
    listRef,
    searchInputRef,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deletedEntitiesDialogOpen,
    setDeletedEntitiesDialogOpen,
    setShouldPreserveSearchFocus,
    handleSelect,
    handleDelete,
    handleCancelDelete,
    handleNavigateUp,
    handleNavigateDown,
    handleEnterAction,
    handleEscapeAction,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleNavigateToFirst,
    handleNavigateToLast,
  }
}
