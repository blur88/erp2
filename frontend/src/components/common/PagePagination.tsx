import { Box, Pagination, Select, Typography } from '@mui/material'

interface PagePaginationProps {
  total: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  pageSizeOptions?: number[]
}

export default function PagePagination({
  total,
  page,
  limit,
  onPageChange,
  onLimitChange,
  pageSizeOptions = [10, 25, 50],
}: PagePaginationProps) {
  const totalPages = Math.ceil(total / limit)
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1,
        borderTop: '1px solid',
        borderColor: 'divider',
        flexWrap: 'wrap',
        gap: 1,
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Showing {from}-{to} of {total} records
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Select
          native
          size="small"
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          sx={{ fontSize: '0.8rem', height: 32 }}
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt} / page
            </option>
          ))}
        </Select>

        <Pagination
          count={totalPages}
          page={page}
          onChange={(_e, value) => onPageChange(value)}
          size="small"
          siblingCount={1}
          boundaryCount={1}
        />
      </Box>
    </Box>
  )
}
