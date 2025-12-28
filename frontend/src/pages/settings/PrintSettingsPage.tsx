import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
} from '@mui/material'
import {
  Print as PrintIcon,
} from '@mui/icons-material'
import { useNotification } from '@/hooks/useNotification'
import { printSettingsApi } from '@/services/printSettingsApi'
import GeneralTab from './PrintSettings/GeneralTab'
import TemplatesTab from './PrintSettings/TemplatesTab'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`print-settings-tabpanel-${index}`}
      aria-labelledby={`print-settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  )
}

const PrintSettingsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [tabValue, setTabValue] = useState(0)
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPrintSettings()
  }, [])

  const fetchPrintSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await printSettingsApi.getPrintSettings()
      setSettings(response)
    } catch (err: any) {
      console.error('Error fetching print settings:', err)
      setError(err.message || 'Failed to load print settings')
      showError('Failed to load print settings')
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  const handleSettingsUpdate = (updatedSettings: any) => {
    setSettings(updatedSettings)
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <PrintIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Print Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure print templates and document footers
          </Typography>
        </Box>
      </Box>

      <Paper sx={{ borderRadius: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="print settings tabs">
            <Tab label="General" id="print-settings-tab-0" />
            <Tab label="Templates" id="print-settings-tab-1" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <GeneralTab
            settings={settings}
            onUpdate={handleSettingsUpdate}
            onRefresh={fetchPrintSettings}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <TemplatesTab
            settings={settings}
            onUpdate={handleSettingsUpdate}
          />
        </TabPanel>
      </Paper>
    </Box>
  )
}

export default PrintSettingsPage
