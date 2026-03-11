export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Any clipboard error (including permission denied) falls through to execCommand
    }
  }

  // execCommand fallback for non-secure contexts (HTTP on local network)
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  try {
    textarea.focus()
    textarea.select()
    return Boolean(document.execCommand('copy'))
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
