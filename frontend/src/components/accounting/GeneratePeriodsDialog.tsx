import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
} from '@mui/material'

interface GeneratePeriodsDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (year: number, startMonth: number) => void
}

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const GeneratePeriodsDialog: React.FC<GeneratePeriodsDialogProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(currentYear)
  const [startMonth, setStartMonth] = useState<number>(1)
  const [yearError, setYearError] = useState<string>('')

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    setYear(value)

    // Validate year
    if (isNaN(value)) {
      setYearError('Please enter a valid year')
    } else if (value < 1900 || value > 2100) {
      setYearError('Year must be between 1900 and 2100')
    } else {
      setYearError('')
    }
  }

  const handleSubmit = () => {
    if (yearError || isNaN(year)) {
      return
    }

    onSubmit(year, startMonth)
  }

  const handleClose = () => {
    setYear(currentYear)
    setStartMonth(1)
    setYearError('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Generate Fiscal Periods</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          This will generate 12 monthly fiscal periods for the selected year starting from the chosen month.
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="Year"
            type="number"
            value={year}
            onChange={handleYearChange}
            error={!!yearError}
            helperText={yearError || 'Enter the fiscal year (e.g., 2026)'}
            fullWidth
            required
            inputProps={{
              min: 1900,
              max: 2100,
              step: 1,
            }}
          />

          <FormControl fullWidth>
            <InputLabel>Start Month</InputLabel>
            <Select
              value={startMonth}
              label="Start Month"
              onChange={(e) => setStartMonth(e.target.value as number)}
            >
              {MONTHS.map((month) => (
                <MenuItem key={month.value} value={month.value}>
                  {month.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Example: Year 2026 starting from January will create periods:
            <br />
            2026-01 (Jan 1 - Jan 31), 2026-02 (Feb 1 - Feb 28), ..., 2026-12 (Dec 1 - Dec 31)
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!!yearError || isNaN(year)}
        >
          Generate Periods
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default GeneratePeriodsDialog
