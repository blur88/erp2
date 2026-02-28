import { useState, useEffect, useCallback, RefObject } from 'react'
import { useDispatch } from 'react-redux'

interface UseSearchAndFilterOptions {
  debounceMs?: number
  initialSearchTerm?: string
  onSearchChange?: (searchTerm: string) => void
  onFilterChange?: (filters: any) => void
  searchInputRef?: RefObject<HTMLInputElement>
}

interface UseSearchAndFilterReturn {
  searchTerm: string
  setSearchTerm: (term: string) => void
  debouncedSearchTerm: string
  handleSearch: () => void
  focusSearchInput: () => void
}

export const useSearchAndFilter = ({
  debounceMs = 500,
  initialSearchTerm = '',
  onSearchChange,
  onFilterChange,
  searchInputRef,
}: UseSearchAndFilterOptions = {}): UseSearchAndFilterReturn => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm)
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearchTerm)

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
      if (onSearchChange) {
        onSearchChange(searchTerm)
      }
    }, debounceMs)

    return () => clearTimeout(timeoutId)
  }, [searchTerm, debounceMs, onSearchChange])

  // Manual search trigger (for Enter key or button clicks)
  const handleSearch = useCallback(() => {
    setDebouncedSearchTerm(searchTerm)
    if (onSearchChange) {
      onSearchChange(searchTerm)
    }
  }, [searchTerm, onSearchChange])

  // Focus search input utility
  const focusSearchInput = useCallback(() => {
    if (searchInputRef?.current) {
      searchInputRef.current.focus()
      searchInputRef.current.select()
    } else {
      // Fallback to querySelector if ref is not provided
      const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
      if (searchInput) {
        searchInput.focus()
        searchInput.select()
      }
    }
  }, [searchInputRef])

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearchTerm,
    handleSearch,
    focusSearchInput,
  }
}

// Enhanced keyboard shortcuts hook with table navigation
export const useKeyboardShortcuts = (callbacks: {
  onSearch?: () => void
  onAdd?: () => void
  onRefresh?: () => void
  onEscape?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onExport?: () => void
  onImport?: () => void
  onViewDeleted?: () => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onEnter?: () => void
  onPageUp?: () => void
  onPageDown?: () => void
  onHome?: () => void
  onEnd?: () => void
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in inputs, except for specific navigation keys
      const target = event.target as HTMLElement
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (isInInput) {
        // Allow certain shortcuts even in inputs
        if (event.key === 'f' || event.key === 'F') {
          if ((event.ctrlKey || event.metaKey) && !event.altKey && callbacks.onSearch) {
            event.preventDefault()
            callbacks.onSearch()
          }
        }
        return
      }

      // Handle modifiers
      const isCtrl = event.ctrlKey || event.metaKey
      const isShift = event.shiftKey
      const isAlt = event.altKey

      switch (event.key) {
        // Search functionality
        case 'f':
        case 'F':
          if (isCtrl && !isAlt && callbacks.onSearch) {
            event.preventDefault()
            callbacks.onSearch()
          }
          break

        // Add new item
        case '+':
        case 'n':
        case 'N':
          if (!isCtrl && !isAlt && !isShift && callbacks.onAdd) {
            event.preventDefault()
            callbacks.onAdd()
          }
          break

        // Refresh
        case 'r':
        case 'R':
          if (isCtrl && !isAlt && callbacks.onRefresh) {
            event.preventDefault()
            callbacks.onRefresh()
          }
          break

        // Edit selected item
        case 'e':
        case 'E':
          if (!isCtrl && !isAlt && !isShift && callbacks.onEdit) {
            event.preventDefault()
            callbacks.onEdit()
          }
          break

        // Delete selected item
        case 'Delete':
        case 'd':
        case 'D':
          if ((event.key === 'Delete' || (!isCtrl && !isAlt && !isShift)) && callbacks.onDelete) {
            event.preventDefault()
            callbacks.onDelete()
          }
          break

        // Export
        case 'x':
        case 'X':
          if (isCtrl && !isAlt && callbacks.onExport) {
            event.preventDefault()
            callbacks.onExport()
          }
          break

        // Import
        case 'i':
        case 'I':
          if (isCtrl && !isAlt && callbacks.onImport) {
            event.preventDefault()
            callbacks.onImport()
          }
          break

        // View deleted items
        case 't':
        case 'T':
          if (!isCtrl && !isAlt && !isShift && callbacks.onViewDeleted) {
            event.preventDefault()
            callbacks.onViewDeleted()
          }
          break

        // Table navigation
        case 'ArrowUp':
          if (callbacks.onArrowUp) {
            event.preventDefault()
            callbacks.onArrowUp()
          }
          break

        case 'ArrowDown':
          if (callbacks.onArrowDown) {
            event.preventDefault()
            callbacks.onArrowDown()
          }
          break

        case 'Enter':
          if (callbacks.onEnter) {
            event.preventDefault()
            callbacks.onEnter()
          }
          break

        case 'PageUp':
          if (callbacks.onPageUp) {
            event.preventDefault()
            callbacks.onPageUp()
          }
          break

        case 'PageDown':
          if (callbacks.onPageDown) {
            event.preventDefault()
            callbacks.onPageDown()
          }
          break

        case 'Home':
          if (callbacks.onHome) {
            event.preventDefault()
            callbacks.onHome()
          }
          break

        case 'End':
          if (callbacks.onEnd) {
            event.preventDefault()
            callbacks.onEnd()
          }
          break

        // Escape to clear selection or close dialogs
        case 'Escape':
          if (callbacks.onEscape) {
            event.preventDefault()
            callbacks.onEscape()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [callbacks])
}
