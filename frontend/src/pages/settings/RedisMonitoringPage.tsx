import React, { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Line } from 'react-chartjs-2'

import { useGetRedisMemoryDetailQuery } from '@/store/api/redisMonitoringApi'
import type {
  RedisInstanceWindowStats,
  RedisMemoryDetailResponse,
} from '@/store/api/redisMonitoringApi'

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
)

type RangeKey = '24h' | '7d' | '30d' | 'custom'

const RANGE_LABELS: Record<RangeKey, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom',
}

function rangeQuery(range: RangeKey): { from?: string; to?: string } {
  const now = new Date()
  if (range === '24h') {
    return { from: new Date(now.getTime() - 24 * 3_600_000).toISOString() }
  }
  if (range === '7d') {
    return { from: new Date(now.getTime() - 7 * 86_400_000).toISOString() }
  }
  if (range === '30d') {
    return { from: new Date(now.getTime() - 30 * 86_400_000).toISOString() }
  }
  return {}
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'No data'
  }
  if (bytes >= 2 ** 30) {
    return `${(bytes / 2 ** 30).toFixed(2)} GiB`
  }
  if (bytes >= 2 ** 20) {
    return `${(bytes / 2 ** 20).toFixed(1)} MiB`
  }
  return `${bytes.toLocaleString()} B`
}

function renderCounter(delta: number | null): string {
  return delta === null ? 'No data' : delta.toLocaleString()
}

export default function RedisMonitoringPage() {
  const [range, setRange] = useState<RangeKey>('24h')
  const [selectedInstance, setSelectedInstance] = useState<string | 'all'>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const queryArgs = useMemo(() => {
    const rangeArgs = range === 'custom' ? {} : rangeQuery(range)
    const from = customFrom ? new Date(customFrom).toISOString() : rangeArgs.from
    const to = customTo ? new Date(customTo).toISOString() : rangeArgs.to
    return {
      from,
      to,
      instanceId: selectedInstance === 'all' ? undefined : selectedInstance,
      allInstances: selectedInstance === 'all',
    }
  }, [range, customFrom, customTo, selectedInstance])

  const { data, isLoading, isError, refetch } = useGetRedisMemoryDetailQuery(queryArgs)

  const chartData = useMemo(() => {
    if (!data) {
      return { datasets: [] }
    }
    const instanceIds = [...new Set(data.samples.map((sample) => sample.instanceId))]
    return {
      datasets: instanceIds.map((instanceId) => ({
        label: instanceId,
        data: data.samples
          .filter((sample) => sample.instanceId === instanceId)
          .map((sample) => ({
            x: sample.at,
            y: sample.utilizationPercent === null ? null : sample.utilizationPercent,
          })),
        borderColor: instanceId === data.configuration.instanceId ? '#1976d2' : '#9e9e9e',
        backgroundColor: instanceId === data.configuration.instanceId ? '#1976d2' : '#9e9e9e',
        tension: 0.3,
        spanGaps: false,
        pointRadius: 0,
      })),
    }
  }, [data])

  const statsById = useMemo(() => {
    if (!data) {
      return new Map<string, RedisInstanceWindowStats>()
    }
    return new Map(data.windowStats.perInstance.map((stats) => [stats.instanceId, stats]))
  }, [data])

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography role="progressbar">Loading Redis monitoring…</Typography>
      </Box>
    )
  }

  if (isError || !data) {
    return (
      <Alert severity="error" data-testid="load-error">
        Failed to load Redis monitoring data.{' '}
        <Button color="inherit" size="small" onClick={() => refetch()}>
          Retry
        </Button>
      </Alert>
    )
  }

  const currentInstanceId = data.configuration.instanceId
  const identityUnconfigured = data.configuration.instanceIdSource !== 'configured'
  const perInstance = data.windowStats.perInstance
  const currentStats = perInstance.find((stats) => stats.instanceId === currentInstanceId)

  return (
    <Box sx={{ p: 3 }} data-testid="redis-monitoring-page">
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Range</InputLabel>
            <Select
              label="Range"
              value={range}
              onChange={(event) => setRange(event.target.value as RangeKey)}
            >
              {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
                <MenuItem key={key} value={key}>
                  {RANGE_LABELS[key]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Instance</InputLabel>
            <Select
              label="Instance"
              value={selectedInstance}
              onChange={(event) => setSelectedInstance(event.target.value as string | 'all')}
            >
              <MenuItem value="all">All instances</MenuItem>
              {data.knownInstances.map((instance) => (
                <MenuItem key={instance.instanceId} value={instance.instanceId}>
                  {instance.instanceId}
                  {instance.current ? ' (current)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {range === 'custom' && (
            <Stack direction="row" spacing={1}>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                aria-label="From"
              />
              <input
                type="datetime-local"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                aria-label="To"
              />
            </Stack>
          )}
        </Stack>

        {identityUnconfigured && (
          <Alert severity="warning" data-testid="identity-warning">
            Instance id is {data.configuration.instanceIdSource}, not configured: a restart may
            fragment history into multiple instance ids.
          </Alert>
        )}

        {data.truncated && (
          <Alert severity="info" data-testid="truncation-notice">
            The chart shows only the newest {data.samples.length.toLocaleString()} of{' '}
            {data.totalMatching.toLocaleString()} samples; statistics cover the full window.
          </Alert>
        )}

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Utilization %</Typography>
          <Line
            data={chartData}
            options={{
              responsive: true,
              scales: {
                x: {
                  type: 'time' as const,
                  time: { unit: range === '24h' ? 'hour' : 'day' },
                },
                y: {
                  min: 0,
                  max: 100,
                  title: { display: true, text: 'utilization %' },
                },
              },
            }}
          />
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {perInstance.map((stats) => (
            <InstanceStatsCard
              key={stats.instanceId}
              stats={stats}
              isCurrent={stats.instanceId === currentInstanceId}
              configuration={data.configuration}
            />
          ))}
        </Box>

        {data.appliedInstanceFilter === 'current' && currentStats && (
          <Card data-testid="live-counters">
            <CardContent>
              <Typography variant="h6">Live counters — current instance</Typography>
              <Typography>
                OOM errors: {data.counters.oomErrors.value?.toLocaleString() ?? 'No data'} (last
                delta {data.counters.oomErrors.lastDelta.toLocaleString()})
              </Typography>
              <Typography>
                Evicted keys: {data.counters.evictedKeys.value?.toLocaleString() ?? 'No data'} (last
                delta {data.counters.evictedKeys.lastDelta.toLocaleString()})
              </Typography>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  )
}

interface InstanceStatsCardProps {
  stats: RedisInstanceWindowStats
  isCurrent: boolean
  configuration: RedisMemoryDetailResponse['configuration']
}

function InstanceStatsCard({ stats, isCurrent, configuration }: InstanceStatsCardProps) {
  const capChanged = stats.distinctMaxBytes.length > 1
  return (
    <Card data-testid={`instance-stats-${stats.instanceId}`}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="h6">
            {stats.instanceId}
            {isCurrent ? ' (current)' : ''}
          </Typography>
          {isCurrent && <Chip label="current" size="small" color="primary" />}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {stats.sampleCount.toLocaleString()} samples ({stats.validSampleCount.toLocaleString()}{' '}
          valid)
        </Typography>
        <Typography>
          Peak used:{' '}
          <strong data-testid="peak-utilization">
            {stats.peakUtilizationPercent === null
              ? 'No data'
              : stats.peakUtilizationPercent.toFixed(2)}
            %{' '}
          </strong>
          ({formatBytes(stats.peakUsedBytes)})
        </Typography>
        <Typography>
          Cap: {stats.distinctMaxBytes.map((cap) => formatBytes(cap)).join(' → ') || 'No data'}
        </Typography>
        {capChanged && (
          <Alert severity="warning" data-testid="cap-changed-notice">
            Cap changed within the window.
          </Alert>
        )}
        <Typography>
          Evicted keys:{' '}
          <span
            data-testid="evicted-keys"
            data-severity={stats.evictedKeys.delta !== null && stats.evictedKeys.delta > 0 ? 'error' : 'success'}
          >
            {renderCounter(stats.evictedKeys.delta)}
          </span>
          {stats.evictedKeys.resetObserved ? ' (reset observed)' : ''}
        </Typography>
        <Typography>
          OOM errors: {renderCounter(stats.oomErrors.delta)}
          {stats.oomErrors.resetObserved ? ' (reset observed)' : ''}
        </Typography>
        {isCurrent && (
          <Typography variant="body2" color="text.secondary">
            Identity: {configuration.instanceId} ({configuration.instanceIdSource})
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
