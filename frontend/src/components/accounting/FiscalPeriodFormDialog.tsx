import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
} from '@mui/material'
import { useDispatch } from 'react-redux'
import { format } from 'date-fns'
import { useNotification } from '@/hooks/useNotification'
import {
  createFiscalPeriod,
  updateFiscalPeriod,
} from '@/store/slices/fiscalPeriodsSlice'
import { FiscalPeriod } from '@/types'

interface FiscalPeriodFormDialogProps {
  open: boolean
  period: FiscalPeriod | null
  onClose: () => void
  onSuccess: () => void
}

interface FormData {
  code: string
  name: string
  startDate: string
  endDate: string
}

const FiscalPeriodFormDialog: React.FC<FiscalPeriodFormDialogProps> = ({
  open,
  period,
  onClose,
  onSuccess,
}) => {
  const dispatch = useDispatch() as any
  const { showError } = useNotification()

  const [formData, setFormData] = useState<FormData>({
    code: '',
    name: '',
    startDate: '',
    endDate: '',
  })

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (period) {
      setFormData({
        code: period.code,
        name: period.name,
        startDate: format(new Date(period.startDate), 'yyyy-MM-dd'),
        endDate: format(new Date(period.endDate), 'yyyy-MM-dd'),
      })
    } else {
      setFormData({
        code: '',
        name: '',
        startDate: '',
        endDate: '',
      })
    }
    setErrors({})
  }, [period, open])

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.code.trim()) {
      newErrors.code = 'Code is required'
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required'
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required'
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate)
      const end = new Date(formData.endDate)

      if (start >= end) {
        newErrors.endDate = 'End date must be after start date'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear error for this field
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }

    setSubmitting(true)

    try {
      if (period) {
        // Update existing period
        await dispatch(
          updateFiscalPeriod({
            id: period.id,
            data: {
              code: formData.code.trim(),
              name: formData.name.trim(),
              startDate: new Date(formData.startDate),
              endDate: new Date(formData.endDate),
            },
          })
        ).unwrap()
      } else {
        // Create new period
        await dispatch(
          createFiscalPeriod({
            code: formData.code.trim(),
            name: formData.name.trim(),
            startDate: new Date(formData.startDate),
            endDate: new Date(formData.endDate),
          })
        ).unwrap()
      }

      onSuccess()
    } catch (error: any) {
      showError(error || `Failed to ${period ? 'update' : 'create'} fiscal period`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{period ? 'Edit Fiscal Period' : 'Create Fiscal Period'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="Code"
            value={formData.code}
            onChange={(e) => handleChange('code', e.target.value)}
            error={!!errors.code}
            helperText={errors.code || 'Unique identifier (e.g., 2026-01)'}
            fullWidth
            required
            disabled={submitting}
          />

          <TextField
            label="Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={!!errors.name}
            helperText={errors.name || 'Period name (e.g., January 2026)'}
            fullWidth
            required
            disabled={submitting}
          />

          <TextField
            label="Start Date"
            type="date"
            value={formData.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
            error={!!errors.startDate}
            helperText={errors.startDate}
            fullWidth
            required
            disabled={submitting}
            InputLabelProps={{
              shrink: true,
            }}
          />

          <TextField
            label="End Date"
            type="date"
            value={formData.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
            error={!!errors.endDate}
            helperText={errors.endDate}
            fullWidth
            required
            disabled={submitting}
            InputLabelProps={{
              shrink: true,
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit" disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
        >
          {period ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default FiscalPeriodFormDialog
