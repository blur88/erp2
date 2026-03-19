import { useEffect, useMemo, useRef, useState } from 'react'
import SearchIcon from '@mui/icons-material/Search'
import {
  Box,
  CircularProgress,
  Divider,
  InputBase,
  Modal,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { useSearchGlobalQuery } from '@/store/api/searchApi'
import type {
  GlobalSearchResultDto,
  GlobalSearchResultType,
} from '@/types/search'

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

const GROUP_ORDER: GlobalSearchResultType[] = [
  'page',
  'customer',
  'product',
  'transaction',
]

const GROUP_LABELS: Record<GlobalSearchResultType, string> = {
  page: 'Pages',
  customer: 'Customers',
  product: 'Products',
  transaction: 'Transactions',
}

const TYPE_BADGES: Record<GlobalSearchResultType, string> = {
  page: 'Page',
  customer: 'Customer',
  product: 'Product',
  transaction: 'Transaction',
}

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [delay, value])

  return debouncedValue
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const debouncedQuery = useDebounce(query, 250)
  const trimmedQuery = debouncedQuery.trim()

  const { data, isLoading, isFetching, isError } = useSearchGlobalQuery(
    { q: trimmedQuery },
    { skip: trimmedQuery.length < 2 },
  )

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [data])

  const flatResults = useMemo(
    () =>
      data
        ? GROUP_ORDER.flatMap((type) =>
            data.results.filter((result) => result.type === type),
          )
        : [],
    [data],
  )

  const groups = useMemo(() => {
    let offset = 0

    return GROUP_ORDER.map((type) => {
      const items = flatResults.filter((result) => result.type === type)
      const group = {
        type,
        label: GROUP_LABELS[type],
        items,
        offset,
      }
      offset += items.length
      return group
    }).filter((group) => group.items.length > 0)
  }, [flatResults])

  const handleClose = () => {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }

  const navigateTo = (route: string) => {
    navigate(route)
    handleClose()
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((currentIndex) =>
        flatResults.length === 0
          ? 0
          : (currentIndex + 1) % flatResults.length,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((currentIndex) =>
        flatResults.length === 0
          ? 0
          : (currentIndex - 1 + flatResults.length) % flatResults.length,
      )
      return
    }

    if (event.key === 'Enter' && flatResults[selectedIndex]) {
      event.preventDefault()
      navigateTo(flatResults[selectedIndex].route)
    }
  }

  const showLoading = (isLoading || isFetching) && !data
  const showError = isError && !showLoading
  const showEmpty = !showLoading && !showError && !!data && flatResults.length === 0
  const showHelp =
    !showLoading && !showError && !data && trimmedQuery.length < 2

  return (
    <Modal open={open} onClose={handleClose} aria-label="Global search">
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, 0)',
          width: { xs: '92vw', sm: 560 },
          maxHeight: '70vh',
          bgcolor: '#1E1E1E',
          border: '1px solid #2A2A2A',
          borderRadius: '12px',
          overflow: 'hidden',
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.5,
            bgcolor: '#232323',
          }}
        >
          <SearchIcon sx={{ color: '#6B7280', fontSize: 20, flexShrink: 0 }} />
          <InputBase
            inputRef={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages, customers, products, transactions..."
            fullWidth
            sx={{
              color: '#E0E0E0',
              fontSize: '0.9375rem',
              '& input::placeholder': { color: '#6B7280' },
            }}
            inputProps={{ 'aria-label': 'search' }}
          />
          {(isLoading || isFetching) && !showLoading && (
            <CircularProgress size={16} />
          )}
        </Box>

        <Divider sx={{ bgcolor: '#2A2A2A' }} />

        <Box sx={{ overflowY: 'auto', maxHeight: 'calc(70vh - 61px)' }}>
          {showHelp && (
            <Typography
              variant="body2"
              sx={{ color: '#A0A0A0', textAlign: 'center', px: 3, py: 4 }}
            >
              Type at least 2 characters to search pages, customers, products,
              and transactions.
            </Typography>
          )}

          {showLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {showError && (
            <Typography
              variant="body2"
              sx={{ color: '#F87171', textAlign: 'center', px: 3, py: 4 }}
            >
              Search unavailable, please try again.
            </Typography>
          )}

          {showEmpty && (
            <Typography
              variant="body2"
              sx={{ color: '#A0A0A0', textAlign: 'center', px: 3, py: 4 }}
            >
              No results for "{data?.query}"
            </Typography>
          )}

          {groups.map((group) => (
            <Box key={group.type}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 2,
                  py: 1,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {group.label}
              </Typography>
              {group.items.map((item, itemIndex) => {
                const flatIndex = group.offset + itemIndex
                const isSelected = flatIndex === selectedIndex

                return (
                  <SearchResultRow
                    key={`${item.type}-${item.id ?? item.route}`}
                    item={item}
                    isSelected={isSelected}
                    onClick={() => navigateTo(item.route)}
                    onHover={() => setSelectedIndex(flatIndex)}
                  />
                )
              })}
            </Box>
          ))}
        </Box>
      </Box>
    </Modal>
  )
}

interface SearchResultRowProps {
  item: GlobalSearchResultDto
  isSelected: boolean
  onClick: () => void
  onHover: () => void
}

function SearchResultRow({
  item,
  isSelected,
  onClick,
  onHover,
}: SearchResultRowProps) {
  return (
    <Box
      onClick={onClick}
      onMouseEnter={onHover}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        px: 2,
        py: 1.25,
        cursor: 'pointer',
        bgcolor: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
        '&:hover': {
          bgcolor: 'rgba(255, 255, 255, 0.08)',
        },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: '#E0E0E0', fontWeight: 600 }}>
          {item.label}
        </Typography>
        {item.description && (
          <Typography
            variant="caption"
            sx={{ color: '#A0A0A0', display: 'block', mt: 0.25 }}
          >
            {item.description}
          </Typography>
        )}
      </Box>

      <Typography
        variant="caption"
        sx={{
          color: '#6B7280',
          bgcolor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '999px',
          px: 1,
          py: 0.5,
          flexShrink: 0,
        }}
      >
        {TYPE_BADGES[item.type]}
      </Typography>
    </Box>
  )
}
