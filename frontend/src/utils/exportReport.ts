import api from '@/services/api'

export async function exportReportExcel(
  url: string,
  params: Record<string, unknown>,
  filename: string,
): Promise<void> {
  const response = await api.get(url, { params, responseType: 'blob' })
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const downloadUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(downloadUrl)
}
