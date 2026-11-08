import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint()
const paths = [
  'src/components/inventory/ProductImportDialog.tsx',
  'src/pages/inventory/InventoryPage.tsx', // PageHeader exception
]

async function restrictedMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter(message => message.ruleId === 'no-restricted-syntax')
}

describe.each(paths)('API response lint guard in %s', filePath => {
  it.each(['get', 'post', 'put', 'patch', 'delete', 'uploadFile'])(
    'rejects any as the %s response type',
    async method => {
      const messages = await restrictedMessages(`ApiService.${method}<any>('/api');`, filePath)
      expect(messages).toHaveLength(1)
      expect(messages[0].severity).toBe(2)
    },
  )

  it.each(['(response as any).data', '(response as any)?.data', '(response as any)["data"]'])(
    'rejects %s',
    async code => {
      expect(await restrictedMessages(`${code};`, filePath)).toHaveLength(1)
    },
  )

  it('allows concrete response types and unrelated existing any uses', async () => {
    expect(await restrictedMessages(`
      ApiService.get<{ data: string[] }>('/api');
      response.data;
      const legacy: any = {};
      (window as any).__ENV__;
    `, filePath)).toHaveLength(0)
  })
})
