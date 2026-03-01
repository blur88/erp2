import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import UploadBackupDialog from '../UploadBackupDialog'

function makeStore() {
  const initialState = { backup: { backupInProgress: false } }
  return configureStore({
    reducer: (state = initialState) => state,
  })
}

function renderDialog(open = true) {
  const store = makeStore()
  const onClose = vi.fn()
  render(
    <Provider store={store}>
      <UploadBackupDialog open={open} onClose={onClose} />
    </Provider>
  )
  return { onClose }
}

function getDropZone() {
  return screen.getByText(/Click to select/i).closest('[data-drag-active]') as HTMLElement;
}

describe('UploadBackupDialog drag and drop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prevents browser default when dragging a file over the drop zone', () => {
    renderDialog()

    const dropZone = getDropZone()
    const dragOverEvent = createEvent.dragOver(dropZone)
    const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault')

    fireEvent(dropZone, dragOverEvent)

    expect(preventDefaultSpy).toHaveBeenCalled()
  })

  it('accepts a valid backup file dropped onto the drop zone', () => {
    renderDialog()

    const dropZone = getDropZone()
    const file = new File(['content'], 'backup-2026.tar.gz', { type: 'application/gzip' })
    const dropEvent = createEvent.drop(dropZone)
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [file] },
    })

    fireEvent(dropZone, dropEvent)

    expect(screen.getByText('backup-2026.tar.gz')).toBeInTheDocument()
  })

  it('rejects an invalid file type dropped onto the drop zone', () => {
    renderDialog()

    const dropZone = getDropZone()
    const file = new File(['content'], 'document.pdf', { type: 'application/pdf' })
    const dropEvent = createEvent.drop(dropZone)
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [file] },
    })

    fireEvent(dropZone, dropEvent)

    expect(screen.getByText(/Please select a valid backup file/i)).toBeInTheDocument()
  })

  it('highlights the drop zone when dragging over it', () => {
    renderDialog()

    const dropZone = getDropZone()
    fireEvent.dragOver(dropZone)

    expect(dropZone).toHaveAttribute('data-drag-active', 'true')
  })

  it('removes highlight when drag leaves the drop zone', () => {
    renderDialog()

    const dropZone = getDropZone()
    fireEvent.dragOver(dropZone)
    fireEvent.dragLeave(dropZone)

    expect(dropZone).toHaveAttribute('data-drag-active', 'false')
  })
})
