import { Box, Card, CardContent, Chip, Grid, Typography } from '@mui/material'

import type { Supplier } from '@/types'

interface SupplierOverviewTabProps {
  supplier: Supplier
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.primary' }}>
        {value != null && value !== '' ? value : '-'}
      </Typography>
    </Box>
  )
}

function isSameAsBilling(supplier: Supplier): boolean {
  const billingFields = [
    supplier.billingStreetAddress,
    supplier.billingStreetAddress2,
    supplier.billingCity,
    supplier.billingState,
    supplier.billingPostalCode,
    supplier.billingCountry,
  ]
  if (billingFields.every((field) => !field)) return false

  return (
    (supplier.shippingStreetAddress ?? '') === (supplier.billingStreetAddress ?? '') &&
    (supplier.shippingStreetAddress2 ?? '') === (supplier.billingStreetAddress2 ?? '') &&
    (supplier.shippingCity ?? '') === (supplier.billingCity ?? '') &&
    (supplier.shippingState ?? '') === (supplier.billingState ?? '') &&
    (supplier.shippingPostalCode ?? '') === (supplier.billingPostalCode ?? '') &&
    (supplier.shippingCountry ?? '') === (supplier.billingCountry ?? '')
  )
}

function formatCityLine(
  city?: string | null,
  state?: string | null,
  postal?: string | null,
  country?: string | null,
): string {
  return [city, state, postal, country].filter(Boolean).join(', ') || '-'
}

function formatSupplierType(type: string): string {
  return type === 'local' ? 'Local' : 'International'
}

export default function SupplierOverviewTab({ supplier }: SupplierOverviewTabProps) {
  const sameAsBilling = isSameAsBilling(supplier)

  return (
    <Box>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Basic Info</Typography>
              <Field label="Company Name" value={supplier.companyName} />
              <Field label="Contact Person" value={supplier.contactPerson} />
              <Field label="Phone" value={supplier.phone} />
              <Field label="Email" value={supplier.email} />
              <Field label="Type" value={formatSupplierType(supplier.type)} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Additional</Typography>
              <Field label="Notes" value={supplier.notes} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Billing Address</Typography>
              <Field label="Address Line 1" value={supplier.billingStreetAddress} />
              <Field label="Address Line 2" value={supplier.billingStreetAddress2} />
              <Field
                label="City / State / Postal / Country"
                value={formatCityLine(
                  supplier.billingCity,
                  supplier.billingState,
                  supplier.billingPostalCode,
                  supplier.billingCountry,
                )}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="h6">Shipping Address</Typography>
                {sameAsBilling && (
                  <Chip label="Same as Billing" size="small" color="success" sx={{ fontSize: '0.7rem' }} />
                )}
              </Box>
              {!sameAsBilling && (
                <>
                  <Field label="Address Line 1" value={supplier.shippingStreetAddress} />
                  <Field label="Address Line 2" value={supplier.shippingStreetAddress2} />
                  <Field
                    label="City / State / Postal / Country"
                    value={formatCityLine(
                      supplier.shippingCity,
                      supplier.shippingState,
                      supplier.shippingPostalCode,
                      supplier.shippingCountry,
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
