import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEntityWorkspace } from './useEntityWorkspace'

const makeEntity = (id: string) => ({ id, name: `Entity ${id}` })

const makeConfig = (overrides = {}) => ({
  entities: [makeEntity('1'), makeEntity('2'), makeEntity('3')],
  selectedEntity: null as { id: string; name: string } | null,
  selectEntity: vi.fn(),
  refetch: vi.fn(),
  navigate: vi.fn(),
  routes: {
    create: '/entities/create',
    edit: (id: string) => `/entities/${id}/edit`,
  },
  notifications: {
    showSuccess: vi.fn(),
    showError: vi.fn(),
  },
  deleteMutation: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

const makeWrapper = (initialUrl: string) => {
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(MemoryRouter, { initialEntries: [initialUrl] }, children)
  return wrapper
}

const makeWrapperWithState = (initialUrl: string, state: Record<string, unknown>) => {
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(MemoryRouter, { initialEntries: [{ pathname: initialUrl, state }] }, children)
  return wrapper
}

describe('useEntityWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with no focused entity and closed dialogs', () => {
    const { result } = renderHook(() => useEntityWorkspace(makeConfig({ entities: [] })), {
      wrapper: makeWrapper('/entities'),
    })

    expect(result.current.focusedIndex).toBe(-1)
    expect(result.current.deleteConfirmOpen).toBe(false)
    expect(result.current.deletedEntitiesDialogOpen).toBe(false)
  })

  it('auto-selects first entity when none selected', () => {
    const config = makeConfig()

    renderHook(() => useEntityWorkspace(config), { wrapper: makeWrapper('/entities') })

    expect(config.selectEntity).toHaveBeenCalledWith(config.entities[0])
  })

  it('handleSelect updates focusedIndex and calls selectEntity', () => {
    const config = makeConfig()
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.handleSelect(config.entities[1])
    })

    expect(result.current.focusedIndex).toBe(1)
    expect(config.selectEntity).toHaveBeenCalledWith(config.entities[1])
  })

  it('handleNavigateDown increments focusedIndex', () => {
    const config = makeConfig({ selectedEntity: makeEntity('1') })
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.setFocusedIndex(0)
    })
    act(() => {
      result.current.handleNavigateDown()
    })

    expect(result.current.focusedIndex).toBe(1)
  })

  it('handleNavigateUp decrements focusedIndex', () => {
    const config = makeConfig({ selectedEntity: makeEntity('2') })
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.setFocusedIndex(1)
    })
    act(() => {
      result.current.handleNavigateUp()
    })

    expect(result.current.focusedIndex).toBe(0)
  })

  it('handleNavigateToFirst sets focusedIndex to 0', () => {
    const config = makeConfig()
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.setFocusedIndex(2)
    })
    act(() => {
      result.current.handleNavigateToFirst()
    })

    expect(result.current.focusedIndex).toBe(0)
  })

  it('handleNavigateToLast sets focusedIndex to last', () => {
    const config = makeConfig()
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.handleNavigateToLast()
    })

    expect(result.current.focusedIndex).toBe(2)
  })

  it('setDeleteConfirmOpen controls dialog state', () => {
    const { result } = renderHook(() => useEntityWorkspace(makeConfig()), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.setDeleteConfirmOpen(true)
    })
    expect(result.current.deleteConfirmOpen).toBe(true)

    act(() => {
      result.current.handleCancelDelete()
    })
    expect(result.current.deleteConfirmOpen).toBe(false)
  })

  it('handleEscapeAction clears selection and closes dialogs', () => {
    const config = makeConfig()
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.setDeleteConfirmOpen(true)
    })
    act(() => {
      result.current.handleEscapeAction()
    })

    expect(result.current.deleteConfirmOpen).toBe(false)
    expect(config.selectEntity).toHaveBeenCalledWith(null)
  })

  it('handleDelete calls deleteMutation and refetch on success', async () => {
    const config = makeConfig({ selectedEntity: makeEntity('1') })
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    await act(async () => {
      await result.current.handleDelete()
    })

    expect(config.deleteMutation).toHaveBeenCalledWith('1')
    expect(config.refetch).toHaveBeenCalled()
    expect(result.current.deleteConfirmOpen).toBe(false)
  })

  it('handleDelete returns without side effects when deleteMutation is omitted', async () => {
    const { deleteMutation, notifications, ...config } = makeConfig({
      selectedEntity: makeEntity('1'),
    })
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    await act(async () => {
      await result.current.handleDelete()
    })

    expect(config.refetch).not.toHaveBeenCalled()
    expect(config.selectEntity).not.toHaveBeenCalledWith(null)
  })

  it('uses custom enter action instead of navigating to edit route', () => {
    const onEnter = vi.fn()
    const config = makeConfig({
      selectedEntity: makeEntity('2'),
      onEnter,
    })
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.setFocusedIndex(1)
    })
    act(() => {
      result.current.handleEnterAction()
    })

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(config.navigate).not.toHaveBeenCalled()
  })

  it('uses custom escape action instead of the default selection reset', () => {
    const onEscape = vi.fn()
    const config = makeConfig({
      selectedEntity: makeEntity('2'),
      onEscape,
    })
    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    act(() => {
      result.current.handleEscapeAction()
    })

    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(config.selectEntity).not.toHaveBeenCalledWith(null)
  })

  it('does not clear selection or focused index when entities list is empty but isLoading is true', () => {
    const config = makeConfig({
      entities: [],
      selectedEntity: makeEntity('1'),
      isLoading: true,
    })

    const { result } = renderHook(() => useEntityWorkspace(config), {
      wrapper: makeWrapper('/entities'),
    })

    expect(config.selectEntity).not.toHaveBeenCalledWith(null)
    expect(result.current.focusedIndex).toBe(-1)
  })
})

describe('locationStateHighlightKey', () => {
  it('selects entity when location.state contains an id string', async () => {
    const config = makeConfig()
    const { result } = renderHook(
      () => useEntityWorkspace({ ...config, locationStateHighlightKey: 'highlightId' }),
      { wrapper: makeWrapperWithState('/entities', { highlightId: '3' }) },
    )

    await waitFor(() => {
      expect(config.selectEntity).toHaveBeenCalledWith(config.entities[2])
      expect(result.current.focusedIndex).toBe(2)
    })
  })

  it('selects entity when location.state contains an entity object', async () => {
    const config = makeConfig()
    const { result } = renderHook(
      () => useEntityWorkspace({ ...config, locationStateHighlightKey: 'highlightEntity' }),
      { wrapper: makeWrapperWithState('/entities', { highlightEntity: config.entities[1] }) },
    )

    await waitFor(() => {
      expect(config.selectEntity).toHaveBeenCalledWith(config.entities[1])
      expect(result.current.focusedIndex).toBe(1)
    })
  })
})
