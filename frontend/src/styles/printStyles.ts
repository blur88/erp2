import { printColors } from '@/styles/printTokens'

export const PRINT_STYLES = `
  body { font-family: 'Roboto', sans-serif; margin: 20px; }
  h1 { text-align: center; margin-bottom: 10px; }
  .header-info { text-align: center; margin-bottom: 20px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid ${printColors.tableBorder}; padding: 6px; text-align: left; }
  th { background-color: ${printColors.tableHeaderBg}; color: ${printColors.background}; font-weight: bold; }
  tr:nth-child(even) { background-color: ${printColors.tableRowAlt}; }
  .text-right { text-align: right; }
  @media print {
    body { margin: 0; padding: 20px 20px 40px 20px; }
    @page { margin: 0; }
  }
`
