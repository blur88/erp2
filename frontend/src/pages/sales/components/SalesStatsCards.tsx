import React from 'react'
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Skeleton,
} from '@mui/material'
import {
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
} from '@mui/icons-material'

export interface StatItem {
    title: string
    value: string | number
    change?: string
    trend?: 'up' | 'down'
    icon: React.ElementType
    color: string
    onClick?: () => void
    currentValue?: number
    comparisonValue?: number
}

interface SalesStatsCardsProps {
    stats: StatItem[]
    loading?: boolean
}

function computeDelta(current: number, comparison: number): { label: string; direction: 'up' | 'down' | 'neutral' } {
    if (comparison === 0 && current > 0) return { label: 'New', direction: 'up' }
    if (comparison === 0 && current === 0) return { label: '0%', direction: 'neutral' }

    const pct = ((current - comparison) / comparison) * 100
    const label = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`

    return {
        label,
        direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
    }
}

const SalesStatsCards: React.FC<SalesStatsCardsProps> = ({ stats, loading = false }) => {
    if (loading) {
        return (
            <Grid container spacing={3} sx={{ mb: 4 }}>
                {[1, 2, 3, 4].map((index) => (
                    <Grid
                        key={index}
                        size={{
                            xs: 12,
                            sm: 6,
                            lg: 3
                        }}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Skeleton variant="circular" width={40} height={40} />
                                    <Skeleton variant="text" width={60} />
                                </Box>
                                <Skeleton variant="text" width="80%" height={32} />
                                <Skeleton variant="text" width="60%" />
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        )
    }

    return (
        <Grid container spacing={3} sx={{ mb: 4 }}>
            {stats.map((stat, index) => (
                <Grid
                    key={index}
                    size={{
                        xs: 12,
                        sm: 6,
                        lg: 3
                    }}>
                    {(() => {
                        const delta = stat.currentValue != null && stat.comparisonValue != null
                            ? computeDelta(stat.currentValue, stat.comparisonValue)
                            : null

                        return (
                    <Card
                        sx={{
                            cursor: stat.onClick ? 'pointer' : 'default',
                            transition: 'all 0.2s ease-in-out',
                            '&:hover': stat.onClick ? {
                                transform: 'translateY(-4px)',
                                boxShadow: 6,
                            } : {}
                        }}
                        onClick={stat.onClick}
                    >
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                <Box
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 2,
                                        bgcolor: `${stat.color}.light`,
                                        color: `${stat.color}.contrastText`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <stat.icon />
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {delta ? (
                                        <Typography
                                            variant="body2"
                                            color={delta.direction === 'up' ? 'success.main' : delta.direction === 'down' ? 'error.main' : 'text.secondary'}
                                        >
                                            {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : ''} {delta.label}
                                        </Typography>
                                    ) : stat.change ? (
                                        <>
                                            {stat.trend === 'up' ? (
                                                <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                            ) : stat.trend === 'down' ? (
                                                <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                                            ) : null}
                                            <Typography
                                                variant="tableCaption"
                                                sx={{
                                                    color: stat.trend === 'up' ? 'success.main' : stat.trend === 'down' ? 'error.main' : 'text.secondary',
                                                    fontWeight: 600,
                                                    fontSize: '0.7rem'
                                                }}
                                            >
                                                {stat.change}
                                            </Typography>
                                        </>
                                    ) : null}
                                </Box>
                            </Box>
                            <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                                {stat.value}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {stat.title}
                            </Typography>
                        </CardContent>
                    </Card>
                        )
                    })()}
                </Grid>
            ))}
        </Grid>
    )
}

export default SalesStatsCards
