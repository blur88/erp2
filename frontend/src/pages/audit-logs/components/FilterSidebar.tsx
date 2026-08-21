import React, { useEffect, useMemo, useState } from 'react'
import { DatePicker } from '@mui/x-date-pickers'
import {
  Box, Button, Chip, Collapse, Divider, IconButton, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography, Autocomplete,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import { default as ChevronLeft } from '@mui/icons-material/ChevronLeft'
import { default as ChevronRight } from '@mui/icons-material/ChevronRight'
import { default as FilterList } from '@mui/icons-material/FilterList'
import { default as Save } from '@mui/icons-material/Save'
import { default as Clear } from '@mui/icons-material/Clear'
import { format, parseISO, subDays, startOfMonth } from 'date-fns'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  setFilters, clearFilters, setSidebarCollapsed,
} from '@/store/slices/auditLogSlice'
import { toMuiDatePickerFormat } from '@/utils/formatters'
import { AuditAction } from '@/types'

const STORAGE_KEY_COLLAPSED = 'audit-logs-sidebar-collapsed'
const STORAGE_KEY_PRESETS = 'audit-logs-filter-presets'

interface FilterPreset {
  name: string
  filters: Record<string, string>
}

const DATE_PRESETS: Array<{ label: string; getValue: () => { startDate?: string; endDate?: string } }> = [
  { label: 'Today', getValue: () => ({ startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Yesterday', getValue: () => ({ startDate: format(subDays(new Date(), 1), 'yyyy-MM-dd'), endDate: format(subDays(new Date(), 1), 'yyyy-MM-dd') }) },
  { label: 'Last 7 days', getValue: () => ({ startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Last 30 days', getValue: () => ({ startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This month', getValue: () => ({ startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Custom', getValue: () => ({}) },
]

interface FilterSidebarProps {
  entityTypes: string[]
  onApply: () => void
}

const FilterSidebar: React.FC<FilterSidebarProps> = ({ entityTypes, onApply }) => {
  const dispatch = useAppDispatch()
  const { filters, sidebarCollapsed } = useAppSelector((state) => state.auditLogs)

  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(null)

  // Regional format, memoised — dateFormat only changes via Settings, which
  // re-renders the app.
  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

  // Load saved presets and sidebar state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_PRESETS)
    if (stored) setPresets(JSON.parse(stored))
    const collapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED)
    if (collapsed !== null) dispatch(setSidebarCollapsed(collapsed === 'true'))
  }, [])

  const handleCollapse = (val: boolean) => {
    dispatch(setSidebarCollapsed(val))
    localStorage.setItem(STORAGE_KEY_COLLAPSED, String(val))
  }

  const handleFilter = (patch: Record<string, string | undefined>) => {
    dispatch(setFilters(patch as any))
  }

  const handleDatePreset = (label: string) => {
    const preset = DATE_PRESETS.find((p) => p.label === label)
    if (!preset) return
    setActiveDatePreset(label)
    if (label !== 'Custom') {
      const { startDate, endDate } = preset.getValue()
      dispatch(setFilters({ startDate, endDate }))
    }
  }

  const handleClear = () => {
    dispatch(clearFilters())
    setActiveDatePreset(null)
    onApply()
  }

  const handleSavePreset = () => {
    const updated = [...presets, { name: presetName, filters: filters as any }]
    setPresets(updated)
    localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(updated))
    setSaveDialogOpen(false)
    setPresetName('')
  }

  const handleLoadPreset = (preset: FilterPreset) => {
    dispatch(clearFilters())
    dispatch(setFilters(preset.filters as any))
  }

  const handleDeletePreset = (name: string) => {
    const updated = presets.filter((p) => p.name !== name)
    setPresets(updated)
    localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(updated))
  }

  if (sidebarCollapsed) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1 }}>
        <Tooltip title="Expand filters" placement="right">
          <IconButton onClick={() => handleCollapse(false)}>
            <ChevronRight />
          </IconButton>
        </Tooltip>
        <FilterList sx={{ color: 'text.secondary', mt: 1 }} />
      </Box>
    )
  }

  return (
    <Paper sx={{ p: 2, height: '100%', minWidth: 240 }}>
      {/* Header */}
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2
        }}>
        <Typography variant="subtitle1" sx={{
          fontWeight: 600
        }}>
          <FilterList sx={{ mr: 0.5, fontSize: 18, verticalAlign: 'middle' }} />
          Filters
        </Typography>
        <Tooltip title="Collapse sidebar">
          <IconButton size="small" onClick={() => handleCollapse(true)}>
            <ChevronLeft />
          </IconButton>
        </Tooltip>
      </Stack>
      {/* Saved presets */}
      {presets.length > 0 && (
        <>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontWeight: 600
            }}>
            Saved Presets
          </Typography>
          <Stack spacing={0.5} sx={{ mb: 2, mt: 0.5 }}>
            {presets.map((p) => (
              <Stack
                key={p.name}
                direction="row"
                sx={{
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                <Button size="small" variant="text" onClick={() => handleLoadPreset(p)} sx={{ textAlign: 'left', justifyContent: 'flex-start' }}>
                  {p.name}
                </Button>
                <IconButton size="small" onClick={() => handleDeletePreset(p.name)} title="Delete preset">
                  <Clear fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
          <Divider sx={{ mb: 2 }} />
        </>
      )}
      {/* Search */}
      <TextField
        fullWidth size="small" label="Search description"
        value={filters.search || ''}
        onChange={(e) => handleFilter({ search: e.target.value })}
        sx={{ mb: 2 }}
      />
      {/* Action chips */}
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          fontWeight: 600
        }}>Action</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, mb: 2 }}>
        {Object.values(AuditAction).map((a) => (
          <Chip
            key={a}
            label={a}
            size="small"
            clickable
            color={filters.action === a ? 'primary' : 'default'}
            onClick={() => handleFilter({ action: filters.action === a ? undefined : a })}
          />
        ))}
      </Box>
      {/* Entity Type */}
      <Autocomplete
        freeSolo
        size="small"
        options={entityTypes}
        value={filters.entityType || ''}
        onInputChange={(_e, val) => handleFilter({ entityType: val })}
        renderInput={(params) => <TextField {...params} label="Entity Type" />}
        sx={{ mb: 2 }}
      />
      {/* User */}
      <TextField
        fullWidth size="small" label="Username"
        value={filters.username || ''}
        onChange={(e) => handleFilter({ username: e.target.value })}
        sx={{ mb: 2 }}
      />
      {/* IP Address */}
      <TextField
        fullWidth size="small" label="IP Address"
        value={filters.ipAddress || ''}
        onChange={(e) => handleFilter({ ipAddress: e.target.value })}
        sx={{ mb: 2 }}
      />
      {/* Date range presets */}
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          fontWeight: 600
        }}>Date Range</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, mb: 1 }}>
        {DATE_PRESETS.map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            size="small"
            clickable
            color={activeDatePreset === p.label ? 'primary' : 'default'}
            onClick={() => handleDatePreset(p.label)}
          />
        ))}
      </Box>
      {(activeDatePreset === 'Custom' || (!activeDatePreset && (filters.startDate || filters.endDate))) && (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <DatePicker
            label="Start Date"
            value={filters.startDate ? parseISO(filters.startDate) : null}
            format={pickerFormat}
            onChange={(d) => {
              // Null clears the bound; Invalid Date is a mid-entry transient
              // and must not remove a populated filter.
              if (d === null) {
                handleFilter({ startDate: undefined })
                return
              }
              if (Number.isNaN(d.getTime())) return
              handleFilter({ startDate: format(d, 'yyyy-MM-dd') })
            }}
            slotProps={{
              textField: { fullWidth: true, size: 'small' },
              field: { clearable: true },
            }}
          />
          <DatePicker
            label="End Date"
            value={filters.endDate ? parseISO(filters.endDate) : null}
            format={pickerFormat}
            onChange={(d) => {
              if (d === null) {
                handleFilter({ endDate: undefined })
                return
              }
              if (Number.isNaN(d.getTime())) return
              handleFilter({ endDate: format(d, 'yyyy-MM-dd') })
            }}
            slotProps={{
              textField: { fullWidth: true, size: 'small' },
              field: { clearable: true },
            }}
          />
        </Stack>
      )}
      {/* Action buttons */}
      <Divider sx={{ my: 2 }} />
      <Stack spacing={1}>
        <Button variant="contained" fullWidth onClick={onApply}>Apply</Button>
        <Button variant="outlined" fullWidth startIcon={<Save />} onClick={() => setSaveDialogOpen(true)}>
          Save Preset
        </Button>
        <Button variant="text" fullWidth startIcon={<Clear />} onClick={handleClear}>
          Clear All
        </Button>
      </Stack>
      {/* Save preset dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save Filter Preset</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" label="Preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePreset} disabled={!presetName.trim()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default FilterSidebar
