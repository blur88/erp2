import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import MasterDetailWorkspace from './MasterDetailWorkspace'

describe('MasterDetailWorkspace', () => {
  it('renders the three slots in desktop mode', () => {
    const { container } = render(
      <MasterDetailWorkspace
        listSlot={<div data-testid="list-slot">List Slot</div>}
        headerSlot={<div data-testid="header-slot">Header Slot</div>}
        workspaceSlot={<div data-testid="workspace-slot">Workspace Slot</div>}
        isMobile={false}
      />,
    )

    expect(screen.getByText('List Slot')).toBeInTheDocument()
    expect(screen.getByText('Header Slot')).toBeInTheDocument()
    expect(screen.getByText('Workspace Slot')).toBeInTheDocument()

    const desktopRoot = container.firstElementChild as HTMLElement
    const rightColumn = screen.getByTestId('header-slot').parentElement as HTMLElement
    const workspaceWrapper = screen.getByTestId('workspace-slot').parentElement as HTMLElement

    const desktopRootStyles = window.getComputedStyle(desktopRoot)
    const rightColumnStyles = window.getComputedStyle(rightColumn)
    const workspaceWrapperStyles = window.getComputedStyle(workspaceWrapper)

    expect(desktopRootStyles.display).toBe('flex')
    expect(desktopRootStyles.flexDirection).toBe('row')
    expect(desktopRootStyles.flexGrow).toBe('1')
    expect(desktopRootStyles.minHeight).toBe('0px')
    expect(rightColumnStyles.display).toBe('flex')
    expect(rightColumnStyles.flexDirection).toBe('column')
    expect(rightColumnStyles.overflow).toBe('hidden')
    expect(rightColumnStyles.minHeight).toBe('0px')
    expect(workspaceWrapperStyles.display).toBe('flex')
    expect(workspaceWrapperStyles.flexDirection).toBe('column')
    expect(workspaceWrapperStyles.overflow).toBe('hidden')
    expect(workspaceWrapperStyles.minHeight).toBe('0px')
  })

  it('renders the same three slots in mobile mode', () => {
    const { container } = render(
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

    const mobileRootStyles = window.getComputedStyle(container.firstElementChild as HTMLElement)
    expect(mobileRootStyles.display).toBe('flex')
    expect(mobileRootStyles.flexDirection).toBe('column')
  })
})
