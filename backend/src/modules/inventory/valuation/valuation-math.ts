type AveragePool = { qty: bigint; value: bigint };

type FifoLayer = {
  id: string;
  remainingQty: bigint;
  remainingValue: bigint;
};

function roundHalfUpRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n)
    throw new Error("roundHalfUpRatio requires a positive denominator");
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

export function averageDecrease(
  pool: AveragePool,
  q: bigint,
): { value: bigint; pool: AveragePool } {
  if (q <= 0n) throw new Error("averageDecrease quantity must be positive");
  if (pool.qty <= 0n || pool.value < 0n)
    throw new Error(
      "averageDecrease pool must have positive quantity and non-negative value",
    );
  if (q > pool.qty)
    throw new Error("averageDecrease quantity exceeds the pool quantity");

  const value =
    q === pool.qty ? pool.value : roundHalfUpRatio(pool.value * q, pool.qty);
  return { value, pool: { qty: pool.qty - q, value: pool.value - value } };
}

export function fifoConsume(
  layers: ReadonlyArray<FifoLayer>,
  q: bigint,
): {
  value: bigint;
  draws: Array<{ layerId: string; qty: bigint; value: bigint }>;
} {
  if (q <= 0n) throw new Error("fifoConsume quantity must be positive");

  let remaining = q;
  let value = 0n;
  const draws: Array<{ layerId: string; qty: bigint; value: bigint }> = [];

  for (const layer of layers) {
    if (layer.remainingQty < 0n || layer.remainingValue < 0n) {
      throw new Error(
        `fifoConsume layer ${layer.id} has negative remaining quantity or value`,
      );
    }
    if (layer.remainingQty === 0n) {
      if (layer.remainingValue !== 0n) {
        throw new Error(
          `fifoConsume layer ${layer.id} has value with no remaining quantity`,
        );
      }
      continue;
    }
    if (remaining === 0n) break;

    const drawQty =
      remaining < layer.remainingQty ? remaining : layer.remainingQty;
    const drawValue =
      drawQty === layer.remainingQty
        ? layer.remainingValue
        : roundHalfUpRatio(layer.remainingValue * drawQty, layer.remainingQty);
    draws.push({ layerId: layer.id, qty: drawQty, value: drawValue });
    value += drawValue;
    remaining -= drawQty;
  }

  if (remaining > 0n)
    throw new Error(
      `fifoConsume layers cannot cover requested quantity; uncovered ${remaining}`,
    );
  return { value, draws };
}

export function unitValueScale4(qty: bigint, value: bigint): bigint | null {
  if (qty === 0n || value === 0n) return null;
  if (qty < 0n || value < 0n)
    throw new Error("unitValueScale4 expects non-negative quantity and value");
  // A cent is 100 scale-4 minor units. Divide by the scale-4 quantity and
  // restore scale-4 precision for a display-only unit value.
  return roundHalfUpRatio(value * 1_000_000n, qty);
}

export function foundStockDefault(pool: AveragePool, q: bigint): bigint | null {
  if (pool.qty === 0n || pool.value === 0n) return null;
  if (pool.qty < 0n || pool.value < 0n || q <= 0n) {
    throw new Error(
      "foundStockDefault expects positive found quantity and a non-negative pool",
    );
  }
  return q === pool.qty
    ? pool.value
    : roundHalfUpRatio(pool.value * q, pool.qty);
}

export function allocateCentsByWeight(
  totalCents: bigint,
  weights: readonly bigint[],
): bigint[] {
  if (weights.some((weight) => weight < 0n)) {
    throw new Error("allocateCentsByWeight does not allow negative weights");
  }
  if (weights.length === 0) {
    if (totalCents === 0n) return [];
    throw new Error(
      "allocateCentsByWeight requires weights for a non-zero total",
    );
  }
  if (totalCents === 0n) return weights.map(() => 0n);

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
  if (weightTotal === 0n)
    throw new Error("allocateCentsByWeight requires a positive weight");

  const negative = totalCents < 0n;
  const magnitude = negative ? -totalCents : totalCents;
  const shares = weights.map((weight) => (magnitude * weight) / weightTotal);
  const remainders = weights.map((weight, index) => ({
    index,
    remainder: (magnitude * weight) % weightTotal,
  }));
  let remaining = magnitude - shares.reduce((sum, share) => sum + share, 0n);

  remainders
    .filter(({ index }) => weights[index] > 0n)
    .sort((left, right) => {
      if (left.remainder === right.remainder) return left.index - right.index;
      return left.remainder > right.remainder ? -1 : 1;
    })
    .some(({ index }) => {
      if (remaining === 0n) return true;
      shares[index] += 1n;
      remaining -= 1n;
      return false;
    });

  if (remaining !== 0n)
    throw new Error("allocateCentsByWeight could not distribute all cents");
  return negative ? shares.map((share) => -share) : shares;
}

export function averageToLayers(
  pool: AveragePool,
  batches: ReadonlyArray<{ batchId: string; remainingQty: bigint }>,
): Array<{ batchId: string; qty: bigint; value: bigint }> {
  if (
    pool.qty < 0n ||
    pool.value < 0n ||
    batches.some((batch) => batch.remainingQty < 0n)
  ) {
    throw new Error(
      "averageToLayers expects non-negative pool and batch quantities",
    );
  }
  const quantityTotal = batches.reduce(
    (sum, batch) => sum + batch.remainingQty,
    0n,
  );
  if (quantityTotal !== pool.qty) {
    throw new Error(
      `averageToLayers batch quantity ${quantityTotal} does not match pool quantity ${pool.qty}`,
    );
  }
  const values = allocateCentsByWeight(
    pool.value,
    batches.map((batch) => batch.remainingQty),
  );
  return batches.map((batch, index) => ({
    batchId: batch.batchId,
    qty: batch.remainingQty,
    value: values[index],
  }));
}

export function layersToAverage(
  layers: ReadonlyArray<
    | { qty: bigint; value: bigint }
    | { remainingQty: bigint; remainingValue: bigint }
    | { remainingQuantity: bigint; remainingValue: bigint }
  >,
): AveragePool {
  return layers.reduce<AveragePool>(
    (pool, layer) => {
      const qty =
        "qty" in layer
          ? layer.qty
          : "remainingQty" in layer
            ? layer.remainingQty
            : layer.remainingQuantity;
      const value = "value" in layer ? layer.value : layer.remainingValue;
      return { qty: pool.qty + qty, value: pool.value + value };
    },
    { qty: 0n, value: 0n },
  );
}
