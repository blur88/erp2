export async function copyToClipboard(
  text: string,
  container: HTMLElement = document.body
): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Any clipboard error (including permission denied) falls through to execCommand
    }
  }

  // execCommand fallback for non-secure contexts (HTTP on local network).
  // The textarea must be appended inside the focus-trap container (e.g. a MUI Popover)
  // so that focus() is not redirected back to the container's root div.
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  container.appendChild(textarea)
  try {
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(0, textarea.value.length)
    return Boolean(document.execCommand('copy'))
  } catch {
    return false
  } finally {
    container.removeChild(textarea)
  }
}
