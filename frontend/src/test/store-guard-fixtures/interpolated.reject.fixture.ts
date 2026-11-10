import { it, expect, vi } from 'vitest'
it('loads', async () => {
  const name = '@/store'
  await import(/* @vite-ignore */ `${name}`)
})
