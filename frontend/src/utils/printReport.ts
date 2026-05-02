import DOMPurify from 'dompurify'

export function printReport(html: string, title: string): void {
  const sanitized = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORCE_BODY: false,
    ADD_TAGS: ['style'],
  })

  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  printWindow.document.write(sanitized)
  printWindow.document.title = title
  printWindow.document.close()

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }
}
