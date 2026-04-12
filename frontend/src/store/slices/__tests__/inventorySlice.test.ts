import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'

import inventoryReducer, {
  selectSelectedCategory,
  setSelectedCategory,
} from '../inventorySlice'
import type { Category } from '@/types'

const makeCategory = (id: string, name: string): Category => ({
  id,
  name,
  level: 0,
  fullPath: name,
  isRoot: true,
  hasChildren: false,
  isActive: true,
  createdAt: new Date('2026-04-12T00:00:00.000Z'),
  updatedAt: new Date('2026-04-12T00:00:00.000Z'),
})

describe('inventorySlice', () => {
  it('stores the selected category', () => {
    const store = configureStore({
      reducer: {
        inventory: inventoryReducer,
      },
    })
    const category = makeCategory('cat-1', 'Electronics')

    store.dispatch(setSelectedCategory(category))

    expect(selectSelectedCategory(store.getState())).toEqual(category)
  })

  it('clears the selected category', () => {
    const store = configureStore({
      reducer: {
        inventory: inventoryReducer,
      },
    })
    const category = makeCategory('cat-1', 'Electronics')

    store.dispatch(setSelectedCategory(category))
    store.dispatch(setSelectedCategory(null))

    expect(selectSelectedCategory(store.getState())).toBeNull()
  })
})
