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
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

export interface StatItem {
    title: string
    value: string | number
    change: string
    trend: 'up' | 'down'
    icon: React.ElementType
    color: string
    onClick?: () => void
}

interface SalesStatsCardsProps {
    stats: StatItem[]
    loading?: boolean
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
                                    {stat.trend === 'up' ? (
                                        <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                    ) : (
                                        <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                                    )}
                                    <Typography
                                        variant={TYPOGRAPHY_STYLES.tableCell.caption.variant}
                                        sx={{
                                            color: stat.trend === 'up' ? 'success.main' : 'error.main',
                                            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                                            fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
                                        }}
                                    >
                                        {stat.change}
                                    </Typography>
                                </Box>
                            </Box>
                            <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 0.5 }}>
                                {stat.value}
                            </Typography>
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                                {stat.title}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            ))}
        </Grid>
    )
}

export default SalesStatsCards
