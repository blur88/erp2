import { Box, Card, CardContent, Chip, Grid, Typography } from '@mui/material'

import type { Customer } from '@/types'

interface CustomerOverviewTabProps {
  customer: Customer
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.primary' }}>
        {value || '—'}
      </Typography>
    </Box>
  )
}

function isSameAsBilling(customer: Customer): boolean {
  const shippingFields = [
    customer.shippingStreetAddress,
    customer.shippingStreetAddress2,
    customer.shippingCity,
    customer.shippingState,
    customer.shippingPostalCode,
    customer.shippingCountry,
  ]
  const allBlank = shippingFields.every((field) => !field)
  if (allBlank) return true

  return (
    (customer.shippingStreetAddress ?? '') === (customer.billingStreetAddress ?? '') &&
    (customer.shippingStreetAddress2 ?? '') === (customer.billingStreetAddress2 ?? '') &&
    (customer.shippingCity ?? '') === (customer.billingCity ?? '') &&
    (customer.shippingState ?? '') === (customer.billingState ?? '') &&
    (customer.shippingPostalCode ?? '') === (customer.billingPostalCode ?? '') &&
    (customer.shippingCountry ?? '') === (customer.billingCountry ?? '')
  )
}

function formatCityLine(
  city?: string | null,
  state?: string | null,
  postal?: string | null,
  country?: string | null,
): string {
  return [city, state, postal, country].filter(Boolean).join(', ') || '—'
}

export default function CustomerOverviewTab({ customer }: CustomerOverviewTabProps) {
  const sameAsBilling = isSameAsBilling(customer)

  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Basic Info
              </Typography>
              <Field label="Name" value={customer.name} />
              <Field label="Phone" value={customer.phone} />
              <Field label="Email" value={customer.email} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Additional
              </Typography>
              <Field label="Price List" value={customer.priceList?.name} />
              <Field label="Notes" value={customer.notes} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Billing Address
              </Typography>
              <Field label="Address Line 1" value={customer.billingStreetAddress} />
              <Field label="Address Line 2" value={customer.billingStreetAddress2} />
              <Field
                label="City / State / Postal / Country"
                value={formatCityLine(
                  customer.billingCity,
                  customer.billingState,
                  customer.billingPostalCode,
                  customer.billingCountry,
                )}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="h6">Shipping Address</Typography>
                {sameAsBilling && (
                  <Chip label="Same as Billing" size="small" color="success" sx={{ fontSize: '0.7rem' }} />
                )}
              </Box>
              {!sameAsBilling && (
                <>
                  <Field label="Address Line 1" value={customer.shippingStreetAddress} />
                  <Field label="Address Line 2" value={customer.shippingStreetAddress2} />
                  <Field
                    label="City / State / Postal / Country"
                    value={formatCityLine(
                      customer.shippingCity,
                      customer.shippingState,
                      customer.shippingPostalCode,
                      customer.shippingCountry,
                    )}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
