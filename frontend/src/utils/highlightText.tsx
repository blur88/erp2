import type { ReactNode } from 'react'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(
  text: string,
  query: string,
  highlightWeight = 700,
  highlightColor?: string,
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
      <span
        style={{
          fontWeight: highlightWeight,
          ...(highlightColor ? { color: highlightColor } : {}),
        }}
      >
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  )
}
