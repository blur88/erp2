import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import {
  FormatListNumbered as DocumentNumberIcon,
  Save as SaveIcon,
} from '@mui/icons-material'
import { useNotification } from '@/hooks/useNotification'
import { settingsApi, type DocumentNumberConfig } from '@/services/settingsApi'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

const DocumentNumbersPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configurations, setConfigurations] = useState<DocumentNumberConfig[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchSettings()
  }, [])

  useEffect(() => {
    // Update previews whenever configurations change
    const newPreviews: Record<string, string> = {}
    configurations.forEach((config) => {
      const paddedNumber = String(config.nextNumber).padStart(config.numberFormat.length, '0')
      newPreviews[config.documentName] = `${config.prefix}-${paddedNumber}`
    })
    setPreviews(newPreviews)
  }, [configurations])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await settingsApi.getDocumentNumberSettings()
      const settings = response as any

      if (settings && settings.configurations) {
        setConfigurations(settings.configurations)
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load settings'
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleConfigChange = (
    index: number,
    field: keyof DocumentNumberConfig,
    value: string | number
  ) => {
    const newConfigurations = [...configurations]
    if (field === 'nextNumber') {
      newConfigurations[index][field] = parseInt(value as string) || 1
    } else {
      newConfigurations[index][field] = value as any
    }
    setConfigurations(newConfigurations)
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)

      // Validate configurations
      for (const config of configurations) {
        if (!config.prefix || !config.numberFormat || config.nextNumber < 1) {
          showError('Please fill in all fields with valid values')
          return
        }
      }

      await settingsApi.updateDocumentNumberSettings({ configurations })
      showSuccess('Document number settings saved successfully')
      await fetchSettings()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save settings'
      showError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    fetchSettings()
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <DocumentNumberIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight }}>
          Document Numbers Settings
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 4 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          Configure document numbering patterns for various business documents. The system will automatically
          generate sequential document numbers based on your settings.
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, fontStyle: 'italic' }}>
          Note: Use zeros to define the number format length (e.g., 000001 for 6-digit numbers).
        </Typography>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: '25%' }}>Document Name</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '20%' }}>Prefix</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '20%' }}>Number Format</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '15%' }}>Next Number</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '20%' }}>Preview</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {configurations.map((config, index) => (
                <TableRow key={config.documentName}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {config.documentName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <TextField
                      value={config.prefix}
                      onChange={(e) => handleConfigChange(index, 'prefix', e.target.value.toUpperCase())}
                      size="small"
                      fullWidth
                      inputProps={{ maxLength: 10 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      value={config.numberFormat}
                      onChange={(e) => {
                        // Only allow numbers (zeros)
                        const value = e.target.value.replace(/[^0]/g, '0')
                        if (value.length <= 10) {
                          handleConfigChange(index, 'numberFormat', value)
                        }
                      }}
                      size="small"
                      fullWidth
                      placeholder="000001"
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      value={config.nextNumber}
                      onChange={(e) => handleConfigChange(index, 'nextNumber', e.target.value)}
                      size="small"
                      fullWidth
                      inputProps={{ min: 1 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        color: 'primary.main',
                        fontWeight: 600,
                        backgroundColor: 'action.hover',
                        px: 2,
                        py: 1,
                        borderRadius: 1,
                      }}
                    >
                      {previews[config.documentName] || 'N/A'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
          <Button
            variant="outlined"
            onClick={handleCancel}
            disabled={submitting}
            size="large"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSubmit}
            disabled={submitting}
            size="large"
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}

export default DocumentNumbersPage
