# Copy Button Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the copy-to-clipboard button silently failing when the app is accessed over HTTP by adding an `execCommand` fallback.

**Architecture:** Extract a shared `copyToClipboard(text): Promise<boolean>` utility that tries the modern Clipboard API first and falls back to a hidden-textarea + `execCommand` approach. Both `useNotification.tsx` and `NotificationPanel.tsx` call this utility and only show the success checkmark when it returns `true`.

**Tech Stack:** React 19, TypeScript, Vitest

---

## Chunk 1: Clipboard utility + tests

### Task 1: Create `clipboard.ts` utility with tests

**Files:**
- Create: `frontend/src/utils/clipboard.ts`
- Create: `frontend/src/utils/clipboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/clipboard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyToClipboard } from './clipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses navigator.clipboard when available and returns true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const result = await copyToClipboard('hello')

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(result).toBe(true)
  })

  it('returns false when navigator.clipboard throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    // execCommand fallback also not available in jsdom — mock it to fail
    document.execCommand = vi.fn().mockReturnValue(false)

    const result = await copyToClipboard('hello')

    expect(result).toBe(false)
  })

  it('falls back to execCommand when navigator.clipboard is undefined and returns true on success', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    document.execCommand = vi.fn().mockReturnValue(true)

    const result = await copyToClipboard('hello world')

    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(result).toBe(true)
  })

  it('returns false when both clipboard API and execCommand fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    document.execCommand = vi.fn().mockReturnValue(false)

    const result = await copyToClipboard('hello')

    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/utils/clipboard.test.ts
```

Expected: FAIL — `copyToClipboard` not found.

- [ ] **Step 3: Implement `clipboard.ts`**

Create `frontend/src/utils/clipboard.ts`:

```ts
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to execCommand
    }
  }

  // execCommand fallback for non-secure contexts (HTTP on local network)
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/utils/clipboard.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/utils/clipboard.ts src/utils/clipboard.test.ts
git commit -m "feat: add copyToClipboard utility with execCommand fallback"
```

---

## Chunk 2: Wire utility into useNotification and NotificationPanel

### Task 2: Update `useNotification.tsx`

**Files:**
- Modify: `frontend/src/hooks/useNotification.tsx` (around line 111–120)

- [ ] **Step 1: Replace `handleCopy` in `useNotification.tsx`**

Find this block (lines ~111–120):

```ts
  const handleCopy = async () => {
    const text = snackbar.title ? `${snackbar.title}: ${snackbar.message}` : snackbar.message
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: select text for manual copy
    }
  }
```

Replace with:

```ts
  const handleCopy = async () => {
    const text = snackbar.title ? `${snackbar.title}: ${snackbar.message}` : snackbar.message
    const success = await copyToClipboard(text)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }
```

Add the import at the top of the file (after existing imports):

```ts
import { copyToClipboard } from '@/utils/clipboard'
```

- [ ] **Step 2: Run frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useNotification.tsx
git commit -m "fix: use copyToClipboard utility in snackbar notification"
```

---

### Task 3: Update `NotificationPanel.tsx`

**Files:**
- Modify: `frontend/src/components/common/NotificationPanel.tsx` (around line 94–106)

- [ ] **Step 1: Replace `handleCopy` in `NotificationPanel.tsx`**

Find this block (lines ~94–106):

```ts
  const handleCopy = async (notificationId: string, message: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(message)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      setCopiedId(notificationId)
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // Silent fallback if clipboard API unavailable
    }
  }
```

Replace with:

```ts
  const handleCopy = async (notificationId: string, message: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const success = await copyToClipboard(message)
    if (success) {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      setCopiedId(notificationId)
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500)
    }
  }
```

Add the import at the top of the file (after existing imports):

```ts
import { copyToClipboard } from '@/utils/clipboard'
```

- [ ] **Step 2: Run frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/NotificationPanel.tsx
git commit -m "fix: use copyToClipboard utility in notification panel (#77)"
```
