import { Grid, Typography } from '@mui/material'
import { Controller, type Control, type FieldErrors, type FieldValues, type Path } from 'react-hook-form'
import { TextField } from '@mui/material'

/**
 * Shared address section for react-hook-form forms.
 * T must have streetAddress, city, state, postalCode, country fields.
 */
interface AddressSectionProps<T extends FieldValues> {
  control: Control<T>
  errors: FieldErrors<T>
}

export default function AddressSection<T extends FieldValues & {
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}>({ control, errors }: AddressSectionProps<T>) {
  return (
    <>
      <Grid size={12}>
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Address Information</Typography>
      </Grid>

      <Grid size={12}>
        <Controller
          name={'streetAddress' as Path<T>}
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              fullWidth
              label="Street Address"
              error={!!errors.streetAddress}
              helperText={errors.streetAddress?.message as string | undefined}
            />
          )}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={'city' as Path<T>}
          control={control}
          render={({ field }) => (
            <TextField {...field} value={field.value || ''} fullWidth label="City" error={!!errors.city} helperText={errors.city?.message as string | undefined} />
          )}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={'state' as Path<T>}
          control={control}
          render={({ field }) => (
            <TextField {...field} value={field.value || ''} fullWidth label="State" error={!!errors.state} helperText={errors.state?.message as string | undefined} />
          )}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={'postalCode' as Path<T>}
          control={control}
          render={({ field }) => (
            <TextField {...field} value={field.value || ''} fullWidth label="Postal Code" error={!!errors.postalCode} helperText={errors.postalCode?.message as string | undefined} />
          )}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={'country' as Path<T>}
          control={control}
          render={({ field }) => (
            <TextField {...field} value={field.value || ''} fullWidth label="Country" error={!!errors.country} helperText={errors.country?.message as string | undefined} />
          )}
        />
      </Grid>
    </>
  )
}
