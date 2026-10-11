// Redux Toolkit batches store notifications per animation frame by default, and
// pairs every frame with a 100 ms fallback timer it gives no way to cancel. The
// fallback calls `cancelAnimationFrame`; one that fires after jsdom has been
// torn down for its test file throws a ReferenceError that fails a run in which
// every test passed (#1364). A test file has two ways not to leave one behind.
import type { ConfigureStoreOptions } from '@reduxjs/toolkit'

type Enhancers = NonNullable<ConfigureStoreOptions['enhancers']>

/**
 * Batching per microtask, which starts no timer. This is NOT how the
 * application's store notifies: subscribers hear of a batched update at the end
 * of the tick instead of on the next frame. It is for a test whose subject is
 * not when a notification arrives. A test of the application's own store, or of
 * anything that depends on that timing, keeps the default and uses
 * `settleFrameBatchedNotifications` instead.
 */
export const tickBatchedEnhancers = ((getDefaultEnhancers: (options: unknown) => unknown) =>
  getDefaultEnhancers({ autoBatch: { type: 'tick' } })) as unknown as Enhancers

// RTK Query's subscription sync runs up to this long after a subscription
// changes, cannot be cancelled, and dispatches a batched action when it does.
const SUBSCRIPTION_SYNC_MS = 500
// The frame fallback of that dispatch, or of any earlier one.
const FRAME_FALLBACK_MS = 100
const MARGIN_MS = 10

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * For stores that keep the default batching: waits, in real time, until no
 * frame fallback can still be pending, and changes nothing about how those
 * stores notify. Call it once, after the file's last test, with everything
 * unmounted and each store's RTK Query state reset (so nothing dispatches
 * again). It does not wait for a frame: the fallback is what has to be gone,
 * and it is gone after its own 100 ms whether or not a frame ever ran.
 */
export async function settleFrameBatchedNotifications() {
  await wait(SUBSCRIPTION_SYNC_MS + MARGIN_MS)
  await wait(FRAME_FALLBACK_MS + MARGIN_MS)
}
