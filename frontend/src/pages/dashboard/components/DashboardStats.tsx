import React from 'react'
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
} from '@mui/material'
import {
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
} from '@mui/icons-material'

interface StatItem {
    title: string
    value: string | number
    change: string
    trend: 'up' | 'down'
    icon: React.ElementType
    color: string
    onClick?: () => void
}

interface DashboardStatsProps {
    stats: StatItem[]
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ stats }) => {
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
                                        variant="tableCaption"
                                        sx={{
                                            color: stat.trend === 'up' ? 'success.main' : 'error.main',
                                            fontWeight: 600,
                                            fontSize: '0.7rem'
                                        }}
                                    >
                                        {stat.change}
                                    </Typography>
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
                </Grid>
            ))}
        </Grid>
    )
}

export default DashboardStats
