export function getDateRangeFromFilter(
  filter: string,
  customFromDate: string,
  customToDate: string,
) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const startOfYear = new Date(today.getFullYear(), 0, 1)

  const formatLocalDate = (date: Date) => date.toISOString().split('T')[0]

  switch (filter) {
    case 'today':
      return { fromDate: formatLocalDate(today), toDate: formatLocalDate(today) }
    case 'yesterday':
      return { fromDate: formatLocalDate(yesterday), toDate: formatLocalDate(yesterday) }
    case 'this_week':
      return { fromDate: formatLocalDate(startOfWeek), toDate: formatLocalDate(today) }
    case 'this_month':
      return { fromDate: formatLocalDate(startOfMonth), toDate: formatLocalDate(today) }
    case 'this_year':
      return { fromDate: formatLocalDate(startOfYear), toDate: formatLocalDate(today) }
    case 'custom':
      return { fromDate: customFromDate, toDate: customToDate }
    default:
      return { fromDate: undefined, toDate: undefined }
  }
}
