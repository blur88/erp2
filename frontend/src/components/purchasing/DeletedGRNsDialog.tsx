import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Box,
  Typography,
  Alert,
  IconButton,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import { default as SearchIcon } from '@mui/icons-material/Search'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { default as GRNIcon } from '@mui/icons-material/LocalShipping'
import { useGetDeletedGRNsQuery } from '@/store/api/purchasingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface DeletedGRNsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedGRNsDialog: React.FC<DeletedGRNsDialogProps> = ({ open, onClose }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { data: deletedGRNsResponse, isFetching: loading } = useGetDeletedGRNsQuery({}, { skip: !open })
  const deletedGRNs = deletedGRNsResponse?.data || []

  const [searchTerm, setSearchTerm] = useState('')

  // Filter GRNs based on search term
  const filteredGRNs = deletedGRNs.filter((grn: any) =>
    grn.grnNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    grn.supplier?.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleClose = () => {
    setSearchTerm('')
    onClose()
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="lg"
        fullWidth
        slotProps={{ paper: { sx: { height: '80vh' } } }}
      >
        <DialogTitle>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <GRNIcon sx={{ color: 'error.main' }} />
              <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
                Deleted Goods Received Notes
              </Typography>
            </Box>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 0.5
            }}>
            Manage soft-deleted GRNs ({filteredGRNs.length} {searchTerm ? 'found' : 'total'})
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              These goods received notes have been soft-deleted. You can restore them to make them active again.
            </Alert>

            <TextField
              fullWidth
              placeholder="Search deleted GRNs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          {loading && filteredGRNs.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer sx={{ overflowX: 'auto', maxHeight: 400 }}>
              <Table
                size="small"
                stickyHeader
                sx={{
                  minWidth: isMobile ? 650 : 800,
                  '& .MuiTableCell-root': {
                    borderBottom: '1px solid rgba(224, 224, 224, 0.4)',
                    py: 0.75,
                    px: 1.5
                  }
                }}
              >
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                    <TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        GRN Number
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: isMobile ? '40%' : '35%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Supplier
                      </Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell sx={{ width: '20%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          GRN Date
                        </Typography>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell sx={{ width: '15%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                          Deleted Date
                        </Typography>
                      </TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredGRNs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 2 : 4} align="center" sx={{ py: 4 }}>
                        <Typography variant="body1" sx={{
                          color: "text.secondary"
                        }}>
                          {searchTerm ? 'No deleted GRNs match your search.' : 'No deleted GRNs found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredGRNs.map((grn: any) => (
                      <TableRow
                        key={grn.id}
                        hover
                        sx={{
                          transition: 'background-color 0.2s ease',
                          cursor: 'default',
                          height: 48
                        }}
                      >
                        <TableCell>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                              {grn.grnNumber}
                            </Typography>
                            {isMobile && (
                              <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: "text.secondary",
                                    fontSize: '0.65rem'
                                  }}>
                                  {grn.receiptDate ? formatDate(grn.receiptDate) : 'Unknown'}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: "text.secondary",
                                    fontSize: '0.65rem'
                                  }}>
                                  • {grn.deletedAt ? formatDate(grn.deletedAt) : 'Unknown'}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {grn.supplier?.companyName || 'Unknown'}
                          </Typography>
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="caption" sx={{
                              color: "text.secondary"
                            }}>
                              {grn.receiptDate ? formatDate(grn.receiptDate) : 'Unknown'}
                            </Typography>
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="caption" sx={{
                              color: "text.secondary"
                            }}>
                              {grn.deletedAt ? formatDate(grn.deletedAt) : 'Unknown'}
                            </Typography>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default DeletedGRNsDialog
