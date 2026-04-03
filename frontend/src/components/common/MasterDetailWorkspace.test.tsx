import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import MasterDetailWorkspace from './MasterDetailWorkspace'

describe('MasterDetailWorkspace', () => {
  it('renders the three slots in desktop mode', () => {
    render(
      <MasterDetailWorkspace
        listSlot={<div>List Slot</div>}
        headerSlot={<div>Header Slot</div>}
        workspaceSlot={<div>Workspace Slot</div>}
        isMobile={false}
      />,
    )

    expect(screen.getByText('List Slot')).toBeInTheDocument()
    expect(screen.getByText('Header Slot')).toBeInTheDocument()
    expect(screen.getByText('Workspace Slot')).toBeInTheDocument()
  })

  it('renders the same three slots in mobile mode', () => {
    render(
      <MasterDetailWorkspace
        listSlot={<div>List Slot</div>}
        headerSlot={<div>Header Slot</div>}
        workspaceSlot={<div>Workspace Slot</div>}
        isMobile
      />,
    )

    expect(screen.getByText('List Slot')).toBeInTheDocument()
    expect(screen.getByText('Header Slot')).toBeInTheDocument()
    expect(screen.getByText('Workspace Slot')).toBeInTheDocument()
  })
})
