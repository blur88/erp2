import { FormControl, Grid, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material'
import { Controller, type Control, type FieldErrors, type FieldValues, type Path } from 'react-hook-form'

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria',
  'Bangladesh', 'Belgium', 'Bolivia', 'Brazil', 'Cambodia', 'Canada', 'Chile',
  'China', 'Colombia', 'Costa Rica', 'Croatia', 'Czech Republic', 'Denmark',
  'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Ethiopia',
  'Finland', 'France', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Honduras',
  'Hong Kong', 'Hungary', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
  'Israel', 'Italy', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait',
  'Lebanon', 'Libya', 'Malaysia', 'Mexico', 'Morocco', 'Myanmar', 'Nepal',
  'Netherlands', 'New Zealand', 'Nicaragua', 'Nigeria', 'Norway', 'Pakistan',
  'Panama', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar',
  'Romania', 'Russia', 'Saudi Arabia', 'Singapore', 'Slovakia', 'Slovenia',
  'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland',
  'Taiwan', 'Thailand', 'Tunisia', 'Turkey', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela',
  'Vietnam', 'Yemen',
]

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
  const street2Key = fieldName('StreetAddress2', 'streetAddress2')
  const cityKey = fieldName('City', 'city')
  const stateKey = fieldName('State', 'state')
  const postalCodeKey = fieldName('PostalCode', 'postalCode')
  const countryKey = fieldName('Country', 'country')

  const streetField = streetKey as Path<T>
  const street2Field = street2Key as Path<T>
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
      {title && (
        <Grid size={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>{title}</Typography>
        </Grid>
      )}

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
              label="Street Address Line 1"
              disabled={disabled}
              error={!!(errors as any)[streetKey]}
              helperText={(errors as any)[streetKey]?.message}
              sx={fieldSx}
            />
          )}
        />
      </Grid>

      <Grid size={12}>
        <Controller
          name={street2Field}
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              fullWidth
              size="small"
              label="Street Address Line 2"
              disabled={disabled}
              error={!!(errors as any)[street2Key]}
              helperText={(errors as any)[street2Key]?.message}
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
              label="State / Province"
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
            <FormControl fullWidth size="small" disabled={disabled} error={!!(errors as any)[countryKey]} sx={fieldSx}>
              <InputLabel>{prefix ? `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Country` : 'Country'}</InputLabel>
              <Select
                {...field}
                value={field.value || ''}
                label={prefix ? `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Country` : 'Country'}
              >
                <MenuItem value=""><em>None</em></MenuItem>
                {COUNTRIES.map((country) => (
                  <MenuItem key={country} value={country}>{country}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      </Grid>
    </>
  )
}
