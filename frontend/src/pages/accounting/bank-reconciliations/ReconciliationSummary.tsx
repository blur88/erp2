import React from 'react'
import { Box, Card, CardContent, Divider, Grid, Typography } from '@mui/material'
import { formatCurrency } from '@/utils/formatters'

export interface ReconciliationSummaryProps {
  moneyIn: string
  moneyOut: string
  calculatedClosingBalance: string
  difference: string
  openingBalanceDifference?: string | null
  unclassifiedCount?: number | null
}

export default function ReconciliationSummary({
  moneyIn,
  moneyOut,
  calculatedClosingBalance,
  difference,
  openingBalanceDifference,
  unclassifiedCount,
}: ReconciliationSummaryProps): React.ReactElement {
  const isDiffZero = /^-?0+(\.0+)?$/.test(difference)
  const isOpeningDiffZero =
    openingBalanceDifference === null ||
    openingBalanceDifference === undefined ||
    /^-?0+(\.0+)?$/.test(openingBalanceDifference)

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Summary
        </Typography>

        <Grid container spacing={3}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Total Money In
            </Typography>
            <Typography variant="h6" data-testid="summary-money-in">
              {formatCurrency(moneyIn)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Total Money Out
            </Typography>
            <Typography variant="h6" data-testid="summary-money-out">
              {formatCurrency(moneyOut)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Calculated Closing
            </Typography>
            <Typography variant="h6" data-testid="summary-calculated-closing">
              {formatCurrency(calculatedClosingBalance)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Difference
            </Typography>
            <Typography
              variant="h6"
              data-testid="summary-difference"
              color={isDiffZero ? 'text.primary' : 'error.main'}
              sx={{ fontWeight: isDiffZero ? 400 : 700 }}
            >
              {formatCurrency(difference)}
            </Typography>
          </Grid>

          {openingBalanceDifference !== undefined && openingBalanceDifference !== null && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Opening Balance Difference
                </Typography>
                <Typography
                  variant="body1"
                  data-testid="summary-opening-difference"
                  color={isOpeningDiffZero ? 'text.primary' : 'error.main'}
                  sx={{ fontWeight: isOpeningDiffZero ? 400 : 700 }}
                >
                  {formatCurrency(openingBalanceDifference)}
                </Typography>
              </Box>
            </Grid>
          )}

          {unclassifiedCount !== undefined && unclassifiedCount !== null && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Unclassified Pre-period Entries
                </Typography>
                <Typography
                  variant="body1"
                  data-testid="summary-unclassified-count"
                  color={unclassifiedCount === 0 ? 'text.primary' : 'warning.main'}
                  sx={{ fontWeight: unclassifiedCount === 0 ? 400 : 700 }}
                >
                  {unclassifiedCount}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  )
}
