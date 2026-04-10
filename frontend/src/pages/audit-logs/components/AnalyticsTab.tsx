import React from 'react'
import {
  Box, Paper, Typography, Grid, CircularProgress,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import type { AuditLogStatistics } from '@/store/api/auditLogApi'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

interface AnalyticsTabProps {
  statistics: AuditLogStatistics | null
  loading: boolean
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ statistics, loading }) => {
  const theme = useTheme()

  const actionPalette: Record<string, string> = {
    CREATE: theme.palette.success.main,
    UPDATE: theme.palette.primary.main,
    DELETE: theme.palette.error.main,
    RESTORE: theme.palette.warning.main,
    BULK_DELETE: theme.palette.secondary.main,
    BULK_RESTORE: theme.palette.error.light,
    EXPORT: theme.palette.secondary.light,
    IMPORT: theme.palette.info.main,
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!statistics) {
    return (
      <Typography
        sx={{
          color: "text.secondary",
          py: 4,
          textAlign: 'center'
        }}>No statistics available.
              </Typography>
    );
  }

  const actionLabels = statistics.byAction.map((a) => a.action)
  const actionCounts = statistics.byAction.map((a) => Number(a.count))
  const actionColors = actionLabels.map((l) => actionPalette[l] ?? theme.palette.grey[500])

  const entityLabels = statistics.byEntityType.map((e) => e.entityType)
  const entityCounts = statistics.byEntityType.map((e) => Number(e.count))

  const userLabels = statistics.topUsers.map((u) => u.username || u.userId)
  const userCounts = statistics.topUsers.map((u) => Number(u.count))

  const barOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { font: { size: 11 } } } },
  }

  const horizontalBarOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { font: { size: 11 } } } },
  }

  return (
    <Grid container spacing={3}>
      {/* Actions Breakdown */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom sx={{
            fontWeight: 600
          }}>
            Actions Breakdown
          </Typography>
          <Doughnut
            data={{
              labels: actionLabels,
              datasets: [{
                data: actionCounts,
                backgroundColor: actionColors,
                borderWidth: 1,
              }],
            }}
            options={{ responsive: true, plugins: { legend: { position: 'right' } } }}
          />
        </Paper>
      </Grid>
      {/* Activity by Action (bar) */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom sx={{
            fontWeight: 600
          }}>
            Activity by Action
          </Typography>
          <Bar
            data={{
              labels: actionLabels,
              datasets: [{
                label: 'Count',
                data: actionCounts,
                backgroundColor: actionColors,
              }],
            }}
            options={barOptions}
          />
        </Paper>
      </Grid>
      {/* Top Users */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom sx={{
            fontWeight: 600
          }}>
            Top Users
          </Typography>
          <Bar
            data={{
              labels: userLabels,
              datasets: [{
                label: 'Actions',
                data: userCounts,
                backgroundColor: theme.palette.primary.main,
              }],
            }}
            options={horizontalBarOptions}
          />
        </Paper>
      </Grid>
      {/* Activity by Entity Type */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom sx={{
            fontWeight: 600
          }}>
            Activity by Entity Type
          </Typography>
          <Bar
            data={{
              labels: entityLabels,
              datasets: [{
                label: 'Count',
                data: entityCounts,
                backgroundColor: theme.palette.secondary.main,
              }],
            }}
            options={horizontalBarOptions}
          />
        </Paper>
      </Grid>
    </Grid>
  );
}

export default AnalyticsTab
