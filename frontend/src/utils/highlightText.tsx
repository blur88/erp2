import type { ReactNode } from 'react'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function highlightText(
  text: string,
  query: string,
  highlightWeight = 700,
): ReactNode {
  const trimmed = query.trim()
  if (!trimmed) return text

  const regex = new RegExp(escapeRegex(trimmed), 'i')
  const match = regex.exec(text)

  if (!match) return text

  const start = match.index
  const end = start + match[0].length

  return (
    <>
      {text.slice(0, start)}
      <span style={{ fontWeight: highlightWeight }}>{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  )
}
