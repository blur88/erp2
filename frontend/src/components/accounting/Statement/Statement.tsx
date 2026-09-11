import React from 'react'

import './statement.css'
import { StatementRowView } from './StatementRow'
import type { StatementProps } from './types'

/**
 * A financial statement rendered as a semantic table.
 *
 * It stays a <table> for three reasons with no non-table equivalent
 * (spec §4.2): `thead { display: table-header-group }` repeats column heads on
 * every printed page; real row/column semantics reach assistive technology;
 * and table column widths are synchronized across rows, which is the shared
 * anchor the decimal alignment depends on.
 */
export function Statement({ rows, figureHeads, label, className }: StatementProps) {
  return (
    <div className={`stmt-root stmt-panel${className ? ` ${className}` : ''}`}>
      <table className="stmt-table" aria-label={label}>
        <thead>
          <tr>
            <th className="stmt-col-head stmt-col-head--label" scope="col" />
            <th className="stmt-col-head stmt-col-head--label" scope="col" />
            {figureHeads.map((head) => (
              <th key={head} className="stmt-col-head" scope="col">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <StatementRowView key={row.id} row={row} figureCount={figureHeads.length} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
