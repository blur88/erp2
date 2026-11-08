import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductImportDialog from '../ProductImportDialog'
import { ApiService } from '@/services/api'

const notifications = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => notifications }))
vi.mock('@/services/api', () => ({ ApiService: { post: vi.fn() } }))

describe('ProductImportDialog', () => {
  it('renders the direct ProductImportResultDto response and refreshes products', async () => {
    // ProductController.importProducts returns ProductImportResultDto directly.
    vi.mocked(ApiService.post).mockResolvedValue({
      totalRows: 4,
      successCount: 2,
      updatedCount: 1,
      skippedCount: 0,
      failureCount: 1,
      errors: [{ row: 5, field: 'name', message: 'Name is required' }],
      warnings: [],
      importedProductIds: ['product-1', 'product-2', 'product-3'],
    })
    const onImportSuccess = vi.fn()
    const user = userEvent.setup()
    const { baseElement } = render(
      <ProductImportDialog open onClose={vi.fn()} onImportSuccess={onImportSuccess} />,
    )
    const input = baseElement.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['name\nProduct'], 'products.csv')] } })
    await user.click(screen.getByRole('button', { name: 'Import Products' }))

    expect(await screen.findByText('2 Created')).toBeInTheDocument()
    expect(screen.getByText('1 Updated')).toBeInTheDocument()
    expect(screen.getByText('1 Failed')).toBeInTheDocument()
    expect(onImportSuccess).toHaveBeenCalledOnce()
    expect(notifications.showSuccess).toHaveBeenCalledWith('Import completed: 2 created, 1 updated')
    expect(notifications.showError).toHaveBeenCalledWith('1 products failed to import. Check the results below.')
    expect(ApiService.post).toHaveBeenCalledWith(
      '/inventory/products/import', expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  })
})
