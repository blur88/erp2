import { useState, useEffect, useCallback } from 'react'
import { useDispatch } from 'react-redux'

interface UseSearchAndFilterOptions {
  debounceMs?: number
  initialSearchTerm?: string
  onSearchChange?: (searchTerm: string) => void
  onFilterChange?: (filters: any) => void
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
    const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
  }, [])

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearchTerm,
    handleSearch,
    focusSearchInput,
  }
}

// Keyboard shortcuts hook
export const useKeyboardShortcuts = (callbacks: {
  onSearch?: () => void
  onAdd?: () => void
  onRefresh?: () => void
  onEscape?: () => void
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in inputs
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow Ctrl+F even in inputs
        if (event.key === 'f' || event.key === 'F') {
          if ((event.ctrlKey || event.metaKey) && !event.altKey && callbacks.onSearch) {
            event.preventDefault()
            callbacks.onSearch()
          }
        }
        return
      }

      switch (event.key) {
        case 'f':
        case 'F':
          if ((event.ctrlKey || event.metaKey) && !event.altKey && callbacks.onSearch) {
            event.preventDefault()
            callbacks.onSearch()
          }
          break
        case '+':
        case 'n':
        case 'N':
          if (!event.ctrlKey && !event.altKey && !event.metaKey && callbacks.onAdd) {
            event.preventDefault()
            callbacks.onAdd()
          }
          break
        case 'r':
        case 'R':
          if ((event.ctrlKey || event.metaKey) && !event.altKey && callbacks.onRefresh) {
            event.preventDefault()
            callbacks.onRefresh()
          }
          break
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

export default useSearchAndFilter