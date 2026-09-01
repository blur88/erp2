import { Box, Typography } from '@mui/material'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

import { printColors } from '@/styles/printTokens'
// Regional Settings, not the browser locale: a printed report must carry the
// date format the business configured, the same as every other date in the app.
import { formatDateTime } from '@/utils/formatters'
import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi'

/**
 * How many AccountingReportPrintLayout instances are currently mounted.
 * Module scope, so every instance shares one count — see the effect below.
 */
let acctPrintModeOwners = 0

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

  // Mark the document while an accounting report is mounted.
  //
  // global.css hides `#root` outright when printing, because the transactional
  // document templates render through a MUI Dialog PORTAL that sits outside
  // `#root` — hiding the app shell is what isolates them. An analytical report
  // is NOT portaled: it renders inside `#root` as an ordinary page, so that same
  // rule would hide the report itself and print a blank sheet. This flag lets
  // the global rule stand down for exactly this flow (see global.css and
  // accountingReportPrint.css); everything else still prints as before.
  // Reference-counted: the class belongs to the document, not to one instance,
  // so a second report mounting and unmounting must not strip it from the first.
  // A plain add/remove pair is wrong the moment two owners overlap — including
  // the mount/unmount/remount that StrictMode performs in development.
  useEffect(() => {
    acctPrintModeOwners += 1
    document.body.classList.add('acct-print-mode')
    return () => {
      acctPrintModeOwners -= 1
      if (acctPrintModeOwners <= 0) {
        acctPrintModeOwners = 0
        document.body.classList.remove('acct-print-mode')
      }
    }
  }, [])

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
          Generated {formatDateTime(new Date())}
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
