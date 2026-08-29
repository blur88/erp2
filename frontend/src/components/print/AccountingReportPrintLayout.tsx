import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

import { printColors } from '@/styles/printTokens'
import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi'

interface AccountingReportPrintLayoutProps {
  /** Report name, e.g. "PROFIT & LOSS". Rendered in caps on the printout. */
  title: string
  /** Period line beneath the title, e.g. "Year 2026". */
  period: string
  /** The report body — tables, totals, whatever the report renders. */
  children: ReactNode
}

/**
 * Print shell shared by analytical accounting reports (Profit & Loss, and the
 * Balance Sheet in Phase 5).
 *
 * Deliberately NOT `BasePrintTemplate`, which is built for transactional
 * documents: it assumes a document number, a recipient, line items and a
 * signature block, none of which an analytical report has.
 *
 * What it owns:
 *  - company identity from Print Settings, so reports match the rest of the
 *    printed output without each page re-deriving it;
 *  - a black-on-white palette from `printTokens`, so a dark UI theme cannot
 *    bleed into the printout;
 *  - the screen/print visibility split — the header block exists only on paper,
 *    and `data-print-hide` marks the app chrome that must not print.
 *
 * Screen rendering is unaffected: everything here except `children` is hidden
 * until the print stylesheet reveals it.
 */
export function AccountingReportPrintLayout({
  title,
  period,
  children,
}: AccountingReportPrintLayoutProps) {
  // May still be loading — the report must remain printable without it, so
  // every field below is rendered only when present.
  const { data: printSettings } = useGetPrintSettingsQuery()

  return (
    <Box
      className="acct-print-root"
      sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Box className="acct-print-header">
        {printSettings?.companyName && (
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {printSettings.companyName}
          </Typography>
        )}
        {printSettings?.address && (
          <Typography variant="body2">{printSettings.address}</Typography>
        )}
        {printSettings?.phone && (
          <Typography variant="body2">{printSettings.phone}</Typography>
        )}
        {printSettings?.email && (
          <Typography variant="body2">{printSettings.email}</Typography>
        )}
        {printSettings?.website && (
          <Typography variant="body2">{printSettings.website}</Typography>
        )}

        <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2">{period}</Typography>
        <Typography variant="caption" sx={{ color: printColors.text }}>
          Generated {new Date().toLocaleString()}
        </Typography>
      </Box>

      {children}

      {printSettings?.reportEndOfDocFooter && (
        <Box
          className="acct-print-footer"
          sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}
        >
          <Typography variant="body2" color="text.secondary">
            {printSettings.reportEndOfDocFooter}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default AccountingReportPrintLayout
