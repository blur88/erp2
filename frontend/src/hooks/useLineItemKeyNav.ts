import { useCallback } from 'react'

function focusCell(row: number, col: number) {
  const cell = document.querySelector(`[data-cell="r${row}-c${col}"]`)
  if (!cell) return
  const target = cell.querySelector<HTMLElement>('input, [tabindex]')
  target?.focus()
}

export function useLineItemKeyNav(
  colCount: number,
  rowCount: number,
  onAddRow: () => void,
): (rowIndex: number, colIndex: number) => React.KeyboardEventHandler<HTMLElement> {
  return useCallback(
    (rowIndex: number, colIndex: number) => (e: React.KeyboardEvent<HTMLElement>) => {
      const isAutocomplete = !!e.currentTarget.closest('.MuiAutocomplete-root')

      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        const prevCol = colIndex - 1
        if (prevCol >= 0) {
          focusCell(rowIndex, prevCol)
        } else if (rowIndex > 0) {
          focusCell(rowIndex - 1, colCount - 1)
        }
        return
      }

      if (e.key === 'Tab' || (!isAutocomplete && e.key === 'ArrowRight')) {
        e.preventDefault()
        const nextCol = colIndex + 1
        if (nextCol < colCount) {
          focusCell(rowIndex, nextCol)
        } else if (rowIndex + 1 < rowCount) {
          focusCell(rowIndex + 1, 0)
        }
        return
      }

      if (!isAutocomplete && e.key === 'ArrowLeft') {
        e.preventDefault()
        const prevCol = colIndex - 1
        if (prevCol >= 0) {
          focusCell(rowIndex, prevCol)
        } else if (rowIndex > 0) {
          focusCell(rowIndex - 1, colCount - 1)
        }
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (rowIndex + 1 < rowCount) {
          focusCell(rowIndex + 1, colIndex)
        }
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (rowIndex > 0) {
          focusCell(rowIndex - 1, colIndex)
        }
        return
      }

      if (!isAutocomplete && e.key === 'Enter') {
        e.preventDefault()
        const isLastCol = colIndex === colCount - 1
        const isLastRow = rowIndex === rowCount - 1
        if (isLastCol && isLastRow) {
          onAddRow()
          setTimeout(() => focusCell(rowIndex + 1, 0), 0)
        } else {
          const nextCol = colIndex + 1
          if (nextCol < colCount) {
            focusCell(rowIndex, nextCol)
          } else {
            focusCell(rowIndex + 1, 0)
          }
        }
      }
    },
    [colCount, rowCount, onAddRow],
  )
}
