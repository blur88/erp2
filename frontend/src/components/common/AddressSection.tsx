import { Grid, TextField, Typography } from '@mui/material'
import { Controller, type Control, type FieldErrors, type FieldValues, type Path } from 'react-hook-form'

interface AddressSectionProps<T extends FieldValues> {
  control: Control<T>
  errors: FieldErrors<T>
  prefix?: 'billing' | 'shipping'
  title?: string
  disabled?: boolean
}

export default function AddressSection<T extends FieldValues>({
  control,
  errors,
  prefix,
  title = 'Address Information',
  disabled = false,
}: AddressSectionProps<T>) {
  const fieldName = (suffix: string, unprefixed: string) => (
    prefix ? `${prefix}${suffix}` : unprefixed
  )
  const streetKey = fieldName('StreetAddress', 'streetAddress')
  const cityKey = fieldName('City', 'city')
  const stateKey = fieldName('State', 'state')
  const postalCodeKey = fieldName('PostalCode', 'postalCode')
  const countryKey = fieldName('Country', 'country')

  const streetField = streetKey as Path<T>
  const cityField = cityKey as Path<T>
  const stateField = stateKey as Path<T>
  const postalCodeField = postalCodeKey as Path<T>
  const countryField = countryKey as Path<T>

  const fieldSx = {
    '& .MuiInputBase-input': { fontSize: '0.875rem' },
    '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  }

  return (
    <>
      <Grid size={12}>
        {title && <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>{title}</Typography>}
      </Grid>

      <Grid size={12}>
        <Controller
          name={streetField}
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              fullWidth
              size="small"
              label="Street Address"
              disabled={disabled}
              error={!!(errors as any)[streetKey]}
              helperText={(errors as any)[streetKey]?.message}
              sx={fieldSx}
            />
          )}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={cityField}
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              fullWidth
              size="small"
              label="City"
              disabled={disabled}
              error={!!(errors as any)[cityKey]}
              helperText={(errors as any)[cityKey]?.message}
              sx={fieldSx}
            />
          )}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={stateField}
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              fullWidth
              size="small"
              label="State"
              disabled={disabled}
              error={!!(errors as any)[stateKey]}
              helperText={(errors as any)[stateKey]?.message}
              sx={fieldSx}
            />
          )}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={postalCodeField}
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              fullWidth
              size="small"
              label="Postal Code"
              disabled={disabled}
              error={!!(errors as any)[postalCodeKey]}
              helperText={(errors as any)[postalCodeKey]?.message}
              sx={fieldSx}
            />
          )}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={countryField}
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              fullWidth
              size="small"
              label="Country"
              disabled={disabled}
              error={!!(errors as any)[countryKey]}
              helperText={(errors as any)[countryKey]?.message}
              sx={fieldSx}
            />
          )}
        />
      </Grid>
    </>
  )
}
