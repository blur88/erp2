import { useEffect, useState } from 'react'
import { Box, Button, Stack, TextField, Typography } from '@mui/material'

import PageSection from '@/components/common/PageSection'
import { useGetFormBSettingsQuery, useUpdateFormBSettingsMutation } from '@/store/api/accountingApi'
import type { FormBIdentityField } from '@/types'

type FieldKey = 'businessName' | 'registrationNumber' | 'businessCode' | 'activityType'

const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: 'businessName', label: 'Business Name' },
  { key: 'registrationNumber', label: 'Registration Number' },
  { key: 'businessCode', label: 'Business Code' },
  { key: 'activityType', label: 'Activity Type' },
]

function helperText(field: FormBIdentityField | undefined): string {
  if (!field) return ''
  if (field.source === 'printSettings') {
    return `Showing '${field.value}' from Print Settings`
  }
  if (field.value === null) return 'Not set'
  return ''
}

export default function FormBIdentitySection() {
  const { data, isLoading } = useGetFormBSettingsQuery()
  const [updateSettings, { isLoading: isSaving }] = useUpdateFormBSettingsMutation()

  const [values, setValues] = useState<Record<FieldKey, string>>({
    businessName: '',
    registrationNumber: '',
    businessCode: '',
    activityType: '',
  })
  const [initial, setInitial] = useState<Record<FieldKey, string>>({
    businessName: '',
    registrationNumber: '',
    businessCode: '',
    activityType: '',
  })

  useEffect(() => {
    if (data) {
      const next: Record<FieldKey, string> = {
        businessName: data.businessName.override ?? '',
        registrationNumber: data.registrationNumber.override ?? '',
        businessCode: data.businessCode.override ?? '',
        activityType: data.activityType.override ?? '',
      }
      setValues(next)
      setInitial(next)
    }
  }, [data])

  const handleChange = (key: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [key]: e.target.value }))
  }

  const hasChanges = FIELDS.some(({ key }) => values[key] !== initial[key])

  const handleSave = async () => {
    const payload: Partial<Record<FieldKey, string>> = {}
    for (const { key } of FIELDS) {
      if (values[key] !== initial[key]) {
        payload[key] = values[key]
      }
    }
    if (Object.keys(payload).length === 0) return
    const result: any = updateSettings(payload as any)
    if (result?.unwrap) await result.unwrap()
    else await result
    setInitial(values)
  }

  if (isLoading) {
    return (
      <PageSection label="Form B Business Information">
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        </Box>
      </PageSection>
    )
  }

  return (
    <PageSection label="Form B Business Information">
      <Box sx={{ p: 2 }}>
        <Stack spacing={2}>
          {FIELDS.map(({ key, label }) => {
            const field = data?.[key]
            return (
              <TextField
                key={key}
                label={label}
                name={key}
                value={values[key] ?? ''}
                onChange={handleChange(key)}
                helperText={helperText(field)}
                fullWidth
                size="small"
                slotProps={{ htmlInput: { 'data-testid': `formb-identity-${key}` } as any }}
                data-testid={`formb-identity-field-${key}`}
              />
            )
          })}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              data-testid="formb-identity-save"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </Box>
        </Stack>
      </Box>
    </PageSection>
  )
}
