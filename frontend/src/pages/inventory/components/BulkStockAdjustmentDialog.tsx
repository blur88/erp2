import React, { useState, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  LinearProgress,
} from '@mui/material'
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  GetApp as DownloadIcon,
  Inventory as BulkIcon,
  Warning as WarningIcon,
} from '@mui/icons-material'
import { useDropzone } from 'react-dropzone'
import { inventoryApi } from '@/services/inventoryApi'
import { StockAdjustmentType } from '@/types'
import { formatCurrency } from '@/utils/currency'

interface BulkStockAdjustmentDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface BulkAdjustmentItem {
  id: string
  productId: string
  productName: string
  productBarcode: string
  currentStock: number
  countedStock: number
  adjustment: number
  type: StockAdjustmentType
  reason: string
  unitCost: number
  totalImpact: number
  locationCode?: string
  notes?: string
}

const BulkStockAdjustmentDialog: React.FC<BulkStockAdjustmentDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adjustments, setAdjustments] = useState<BulkAdjustmentItem[]>([])
  const [globalReason, setGlobalReason] = useState('')
  const [globalNotes, setGlobalNotes] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setAdjustments([])
      setGlobalReason('')
      setGlobalNotes('')
      setError(null)
      setUploadProgress(null)
    }
  }, [open])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }

    try {
      setLoading(true)
      setUploadProgress(0)
      setError(null)

      const formData = new FormData()
      formData.append('file', file)

      // Simulate progress for user feedback
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev === null) return 10
          if (prev >= 90) return prev
          return prev + Math.random() * 20
        })
      }, 200)

      // Parse CSV file
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        throw new Error('CSV file must contain at least a header row and one data row')
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const requiredHeaders = ['product_id', 'barcode', 'current_stock', 'counted_stock', 'reason']
      
      const missingHeaders = requiredHeaders.filter(header => 
        !headers.some(h => h.includes(header.replace('_', '')))
      )

      if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`)
      }

      const parsedItems: BulkAdjustmentItem[] = []
      
      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(',').map(v => v.trim())
          if (values.length < headers.length) continue

          const productId = values[headers.findIndex(h => h.includes('productid') || h.includes('product_id'))]
          const barcode = values[headers.findIndex(h => h.includes('barcode') || h.includes('sku'))]
          const productName = values[headers.findIndex(h => h.includes('name') || h.includes('product'))] || 'Unknown Product'
          const currentStock = parseFloat(values[headers.findIndex(h => h.includes('currentstock') || h.includes('current_stock'))]) || 0
          const countedStock = parseFloat(values[headers.findIndex(h => h.includes('countedstock') || h.includes('counted_stock'))]) || 0
          const reason = values[headers.findIndex(h => h.includes('reason'))] || 'Bulk adjustment'
          const unitCost = parseFloat(values[headers.findIndex(h => h.includes('unitcost') || h.includes('cost'))]) || 0
          const locationCode = values[headers.findIndex(h => h.includes('location'))] || 'MAIN'
          const notes = values[headers.findIndex(h => h.includes('notes'))] || ''

          if (!productId && !barcode) continue

          const adjustment = countedStock - currentStock
          const type = adjustment > 0 ? StockAdjustmentType.FOUND : 
                      adjustment < 0 ? StockAdjustmentType.LOSS : 
                      StockAdjustmentType.PHYSICAL_COUNT

          parsedItems.push({
            id: `temp-${i}`,
            productId: productId || `lookup-${barcode}`,
            productName,
            productBarcode: barcode,
            currentStock,
            countedStock,
            adjustment,
            type,
            reason,
            unitCost,
            totalImpact: adjustment * unitCost,
            locationCode,
            notes,
          })
        } catch (rowError) {
          console.warn(`Error parsing row ${i + 1}:`, rowError)
        }
      }

      clearInterval(progressInterval)
      setUploadProgress(100)

      setTimeout(() => {
        setAdjustments(parsedItems)
        setUploadProgress(null)
      }, 500)

    } catch (err: any) {
      console.error('Error processing CSV:', err)
      setError(err?.message || 'Failed to process CSV file')
      setUploadProgress(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  })

  const handleSubmit = async () => {
    if (adjustments.length === 0) {
      setError('Please add at least one adjustment')
      return
    }

    if (!globalReason.trim()) {
      setError('Global reason is required for bulk adjustments')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const bulkData = {
        adjustments: adjustments.map(item => ({
          productId: item.productId,
          type: item.type,
          adjustmentQuantity: item.adjustment,
          systemQuantity: item.currentStock,
          actualQuantity: item.countedStock,
          reason: item.reason,
          notes: item.notes,
          unitCost: item.unitCost,
          locationCode: item.locationCode,
        })),
        globalReason,
        globalNotes,
        requiresApproval: true, // Bulk adjustments typically require approval
      }

      await inventoryApi.createBulkStockAdjustments(bulkData)
      onSuccess()
    } catch (err: any) {
      console.error('Error creating bulk adjustments:', err)
      setError(err?.response?.data?.message || err?.message || 'Failed to create bulk adjustments')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveAdjustment = (id: string) => {
    setAdjustments(prev => prev.filter(item => item.id !== id))
  }

  const downloadTemplate = () => {
    const csvContent = [
      'product_id,barcode,product_name,current_stock,counted_stock,reason,unit_cost,location_code,notes',
      'sample-id-1,SKU001,Sample Product 1,100,95,Physical count discrepancy,10.50,MAIN,Found 5 units damaged',
      'sample-id-2,SKU002,Sample Product 2,50,55,Physical count discrepancy,25.00,MAIN,Found additional units in storage',
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bulk_stock_adjustment_template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const totalAdjustments = adjustments.length
  const totalImpact = adjustments.reduce((sum, item) => sum + item.totalImpact, 0)
  const increasingItems = adjustments.filter(item => item.adjustment > 0).length
  const decreasingItems = adjustments.filter(item => item.adjustment < 0).length

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main' }}>
            <BulkIcon />
          </Avatar>
          <Box>
            <Typography variant="h6">Bulk Stock Adjustments</Typography>
            <Typography variant="body2" color="text.secondary">
              Import multiple stock adjustments from CSV file
            </Typography>
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Upload Section */}
        {adjustments.length === 0 && (
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Upload CSV File</Typography>
              <Button
                startIcon={<DownloadIcon />}
                onClick={downloadTemplate}
                size="small"
                variant="outlined"
              >
                Download Template
              </Button>
            </Box>

            <Card
              {...getRootProps()}
              sx={{
                p: 4,
                border: '2px dashed',
                borderColor: isDragActive ? 'primary.main' : 'grey.300',
                bgcolor: isDragActive ? 'primary.light' : 'grey.50',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.3s ease',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'primary.light',
                }
              }}
            >
              <input {...getInputProps()} />
              <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                {isDragActive ? 'Drop the CSV file here' : 'Drag & drop CSV file or click to browse'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Supports CSV files with stock adjustment data
              </Typography>
              {uploadProgress !== null && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress variant="determinate" value={uploadProgress} />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                    Processing... {Math.round(uploadProgress)}%
                  </Typography>
                </Box>
              )}
            </Card>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Required columns:</strong> product_id, barcode, current_stock, counted_stock, reason
                <br />
                <strong>Optional columns:</strong> product_name, unit_cost, location_code, notes
              </Typography>
            </Alert>
          </Box>
        )}

        {/* Summary Stats */}
        {adjustments.length > 0 && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={3}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
                    {totalAdjustments}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Total Items
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h4" sx={{ fontWeight: 600, mb: 1, color: 'success.main' }}>
                    {increasingItems}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Increases
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h4" sx={{ fontWeight: 600, mb: 1, color: 'error.main' }}>
                    {decreasingItems}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Decreases
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography 
                    variant="h4" 
                    sx={{ 
                      fontWeight: 600, 
                      mb: 1,
                      color: totalImpact > 0 ? 'success.main' : totalImpact < 0 ? 'error.main' : 'inherit'
                    }}
                  >
                    {formatCurrency(Math.abs(totalImpact))}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Total Impact
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Global Settings */}
        {adjustments.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Global Settings
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Global Reason *"
                  fullWidth
                  multiline
                  rows={2}
                  value={globalReason}
                  onChange={(e) => setGlobalReason(e.target.value)}
                  placeholder="e.g., Monthly physical inventory count"
                  disabled={loading}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Global Notes"
                  fullWidth
                  multiline
                  rows={2}
                  value={globalNotes}
                  onChange={(e) => setGlobalNotes(e.target.value)}
                  placeholder="Additional notes for all adjustments..."
                  disabled={loading}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Adjustments Table */}
        {adjustments.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Adjustment Items</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={() => {
                  setAdjustments([])
                }}
                size="small"
                variant="outlined"
              >
                Start Over
              </Button>
            </Box>

            <TableContainer component={Card} sx={{ maxHeight: 400 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Current</TableCell>
                    <TableCell align="right">Counted</TableCell>
                    <TableCell align="right">Adjustment</TableCell>
                    <TableCell align="right">Impact</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {adjustments.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {item.productName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.productBarcode}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {item.currentStock.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {item.countedStock.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontWeight: 600,
                            color: item.adjustment > 0 ? 'success.main' : item.adjustment < 0 ? 'error.main' : 'inherit'
                          }}
                        >
                          {item.adjustment > 0 ? '+' : ''}{item.adjustment.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {formatCurrency(Math.abs(item.totalImpact))}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={item.type}
                          size="small"
                          color={item.adjustment > 0 ? 'success' : item.adjustment < 0 ? 'error' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.locationCode}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleRemoveAdjustment(item.id)}
                          disabled={loading}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {adjustments.length > 10 && (
              <Alert severity="warning" sx={{ mt: 2 }} icon={<WarningIcon />}>
                <Typography variant="body2">
                  Large bulk adjustments with {adjustments.length} items will require approval before being processed.
                </Typography>
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        {adjustments.length > 0 && (
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={loading || !globalReason.trim()}
          >
            {loading ? 'Creating Adjustments...' : `Create ${totalAdjustments} Adjustments`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default BulkStockAdjustmentDialog