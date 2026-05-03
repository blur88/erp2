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

import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi'
import PageHeader from '@/components/common/PageHeader'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
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
  const [tabValue, setTabValue] = useState(0)
  const [localSettings, setLocalSettings] = useState<any>(null)

  const { data: printSettingsData, isLoading: loading, error: fetchError, refetch } = useGetPrintSettingsQuery()

  // Keep localSettings in sync with RTK data
  useEffect(() => {
    if (printSettingsData) {
      setLocalSettings(printSettingsData)
    }
  }, [printSettingsData])

  const settings = localSettings ?? printSettingsData ?? null
  const error = fetchError ? ((fetchError as any)?.message || 'Failed to load print settings') : null

  const fetchPrintSettings = () => {
    refetch()
  }

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  const handleSettingsUpdate = (updatedSettings: any) => {
    setLocalSettings(updatedSettings)
  }

  if (loading) {
    return (
      <GenericOverviewPage>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </GenericOverviewPage>
    )
  }

  if (error) {
    return (
      <GenericOverviewPage>
        <Alert severity="error">{error}</Alert>
      </GenericOverviewPage>
    )
  }

  return (
    <GenericOverviewPage>
      {/* Header */}
      <PageHeader
        title="Print Settings"
        subtitle="Configure print templates and document footers"
      />

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
    </GenericOverviewPage>
  )
}

export default PrintSettingsPage
