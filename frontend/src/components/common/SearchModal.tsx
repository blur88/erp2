import { useEffect, useMemo, useRef, useState } from 'react';
import HistoryIcon from '@mui/icons-material/History';
import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  CircularProgress,
  Divider,
  InputBase,
  Modal,
  Typography,
  useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { useAppSelector } from '@/hooks/useRedux';
import { useSearchGlobalQuery } from '@/store/api/searchApi';
import { selectCurrentUser } from '@/store/slices/authSlice';
import type { GlobalSearchResultDto, GlobalSearchResultType } from '@/types/search';
import { addRecentSearch, getRecentSearches, type RecentSearchItem } from '@/utils/recentSearch';
import { highlightText } from '@/utils/highlightText';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

const GROUP_ORDER: GlobalSearchResultType[] = [
  'customer',
  'product',
  'transaction',
  'supplier',
  'page',
];

const GROUP_LABELS: Record<GlobalSearchResultType, string> = {
  page: 'Pages',
  customer: 'Customers',
  product: 'Products',
  transaction: 'Transactions',
  supplier: 'Suppliers',
};

const TYPE_BADGES: Record<GlobalSearchResultType, string> = {
  page: 'Page',
  customer: 'Customer',
  product: 'Product',
  transaction: 'Transaction',
  supplier: 'Supplier',
};

type NavigableItem = {
  label: string;
  description?: string;
  route: string;
  type: GlobalSearchResultType;
};

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, value]);

  return debouncedValue;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUser = useAppSelector(selectCurrentUser);
  const userId = currentUser?.id ?? '';
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);
  const debouncedQuery = useDebounce(query, 250);
  const trimmedQuery = debouncedQuery.trim();
  const isEmptyQuery = trimmedQuery.length === 0;
  const isActiveQuery = trimmedQuery.length >= 2;

  const { data, isLoading, isFetching, isError } = useSearchGlobalQuery(
    { q: trimmedQuery },
    { skip: !isActiveQuery },
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (open && userId) {
      setRecentSearches(getRecentSearches(userId));
    }
  }, [open, userId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [data]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [isEmptyQuery]);

  const flatResults = useMemo((): NavigableItem[] => {
    if (isEmptyQuery) {
      return recentSearches;
    }

    if (!isActiveQuery || !data) {
      return [];
    }

    return GROUP_ORDER.flatMap((type) => data.results.filter((result) => result.type === type));
  }, [data, isActiveQuery, isEmptyQuery, recentSearches]);

  const groups = useMemo(() => {
    let offset = 0;

    return GROUP_ORDER.map((type) => {
      const items = flatResults.filter((result) => result.type === type);
      const group = {
        type,
        label: GROUP_LABELS[type],
        items,
        offset,
      };
      offset += items.length;
      return group;
    }).filter((group) => group.items.length > 0);
  }, [flatResults]);

  const handleClose = () => {
    setQuery('');
    setSelectedIndex(0);
    onClose();
  };

  const handleSelect = (item: NavigableItem) => {
    if (userId) {
      addRecentSearch(userId, {
        label: item.label,
        description: item.description,
        route: item.route,
        type: item.type,
      });

      const stored = getRecentSearches(userId);
      if (stored.some((entry) => entry.route === item.route)) {
        setRecentSearches(stored);
      } else {
        setRecentSearches((current) =>
          [
            { ...item, timestamp: Date.now() },
            ...current.filter((entry) => entry.route !== item.route),
          ].slice(0, 8),
        );
      }
    }

    navigate(item.route);
    handleClose();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((currentIndex) =>
        flatResults.length === 0 ? 0 : (currentIndex + 1) % flatResults.length,
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((currentIndex) =>
        flatResults.length === 0 ? 0 : (currentIndex - 1 + flatResults.length) % flatResults.length,
      );
      return;
    }

    if (event.key === 'Enter' && flatResults[selectedIndex]) {
      event.preventDefault();
      handleSelect(flatResults[selectedIndex]);
    }
  };

  const showHelp = !isEmptyQuery && !isActiveQuery;
  const showRecent = isEmptyQuery;
  const showLive = isActiveQuery;
  const showLoading = showLive && (isLoading || isFetching) && !data;
  const showError = showLive && isError && !showLoading;
  const showEmpty = showLive && !showLoading && !showError && !!data && flatResults.length === 0;

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
          bgcolor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
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
            bgcolor: theme.palette.divider,
          }}
        >
          <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: 20, flexShrink: 0 }} />
          <InputBase
            inputRef={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages, customers, products, transactions..."
            fullWidth
            sx={{
              color: theme.palette.text.primary,
              fontSize: '0.9375rem',
              '& input::placeholder': { color: theme.palette.text.secondary },
            }}
            slotProps={{ input: { 'aria-label': 'search' } }}
          />
          {(isLoading || isFetching) && !showLoading && <CircularProgress size={16} />}
        </Box>

        <Divider sx={{ bgcolor: theme.palette.divider }} />

        <Box sx={{ overflowY: 'auto', maxHeight: 'calc(70vh - 61px)' }}>
          {showHelp && (
            <Typography
              variant="body2"
              sx={{ color: theme.palette.text.secondary, textAlign: 'center', px: 3, py: 4 }}
            >
              Type at least 2 characters to search pages, customers, products, and transactions.
            </Typography>
          )}

          {showRecent && recentSearches.length === 0 && (
            <Typography
              variant="body2"
              sx={{ color: theme.palette.text.secondary, textAlign: 'center', px: 3, py: 4 }}
            >
              Start typing to search
            </Typography>
          )}

          {showRecent && recentSearches.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 2,
                  py: 1,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Recent
              </Typography>
              {recentSearches.map((item, idx) => (
                <SearchResultRow
                  key={`recent-${item.route}`}
                  item={item}
                  isSelected={idx === selectedIndex}
                  onClick={() => handleSelect(item)}
                  onHover={() => setSelectedIndex(idx)}
                  query=""
                  highlightColor={theme.palette.primary.light}
                  isRecent={true}
                />
              ))}
            </Box>
          )}

          {showLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {showError && (
            <Typography
              variant="body2"
              sx={{ color: theme.palette.error.light, textAlign: 'center', px: 3, py: 4 }}
            >
              Search unavailable, please try again.
            </Typography>
          )}

          {showEmpty && (
            <Box sx={{ textAlign: 'center', px: 3, py: 4 }}>
              <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                No results for "{trimmedQuery}"
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: theme.palette.text.secondary, mt: 0.5, display: 'block' }}
              >
                Try searching by name, code, SKU, or order number
              </Typography>
            </Box>
          )}

          {showLive &&
            groups.map((group) => (
              <Box key={group.type}>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    px: 2,
                    py: 1,
                    color: theme.palette.text.secondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {group.label}
                </Typography>
                {group.items.map((item, itemIndex) => {
                  const flatIndex = group.offset + itemIndex;
                  const isSelected = flatIndex === selectedIndex;

                  return (
                    <SearchResultRow
                      key={`${item.type}-${item.route}`}
                      item={item}
                      isSelected={isSelected}
                      onClick={() => handleSelect(item)}
                      onHover={() => setSelectedIndex(flatIndex)}
                      query={trimmedQuery}
                      highlightColor={theme.palette.primary.light}
                    />
                  );
                })}
              </Box>
            ))}
        </Box>
      </Box>
    </Modal>
  );
}

interface SearchResultRowProps {
  item: NavigableItem;
  isSelected: boolean;
  onClick: () => void;
  onHover: () => void;
  query: string;
  highlightColor: string;
  isRecent?: boolean;
}

function SearchResultRow({
  item,
  isSelected,
  onClick,
  onHover,
  query,
  highlightColor,
  isRecent = false,
}: SearchResultRowProps) {
  return (
    <Box
      onClick={onClick}
      onMouseEnter={onHover}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1.25,
        cursor: 'pointer',
        bgcolor: isSelected ? 'action.selected' : 'transparent',
        '&:hover': {
          bgcolor: 'action.selected',
        },
      }}
    >
      {isRecent && <HistoryIcon sx={{ color: 'text.secondary', fontSize: 16, flexShrink: 0 }} />}

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ color: 'text.primary', fontWeight: 600 }}>
          {highlightText(item.label, query, 700, highlightColor)}
        </Typography>
        {item.description && (
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}
          >
            {highlightText(item.description, query, 400, highlightColor)}
          </Typography>
        )}
      </Box>

      {!isRecent && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            bgcolor: 'action.hover',
            borderRadius: '999px',
            px: 1,
            py: 0.5,
            flexShrink: 0,
          }}
        >
          {TYPE_BADGES[item.type]}
        </Typography>
      )}
    </Box>
  );
}
