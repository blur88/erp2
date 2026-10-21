import {
  allocateCentsByWeight,
  averageDecrease,
  averageToLayers,
  fifoConsume,
  foundStockDefault,
  layersToAverage,
  unitValueScale4,
} from "./valuation-math";

describe("inventory valuation math", () => {
  it("removes the exact remaining pool value when the full quantity is issued", () => {
    const partial = averageDecrease({ qty: 30000n, value: 1000n }, 10000n);
    expect(partial).toEqual({
      value: 333n,
      pool: { qty: 20000n, value: 667n },
    });
    expect(averageDecrease(partial.pool, 20000n)).toEqual({
      value: 667n,
      pool: { qty: 0n, value: 0n },
    });
  });

  it("rounds an average decrease half up to cents", () => {
    expect(averageDecrease({ qty: 30000n, value: 1001n }, 15000n)).toEqual({
      value: 501n,
      pool: { qty: 15000n, value: 500n },
    });
  });

  it("consumes FIFO layers oldest first and rounds a partial layer half up", () => {
    expect(
      fifoConsume(
        [
          { id: "a", remainingQty: 20000n, remainingValue: 1000n },
          { id: "b", remainingQty: 30000n, remainingValue: 3600n },
        ],
        30000n,
      ),
    ).toEqual({
      value: 2200n,
      draws: [
        { layerId: "a", qty: 20000n, value: 1000n },
        { layerId: "b", qty: 10000n, value: 1200n },
      ],
    });
  });

  it("allocates average value over physical batches by largest remainder", () => {
    const layers = averageToLayers({ qty: 30000n, value: 1000n }, [
      { batchId: "x", remainingQty: 10000n },
      { batchId: "y", remainingQty: 20000n },
    ]);
    expect(layers).toEqual([
      { batchId: "x", qty: 10000n, value: 333n },
      { batchId: "y", qty: 20000n, value: 667n },
    ]);
    expect(layersToAverage(layers)).toEqual({ qty: 30000n, value: 1000n });
  });

  it("breaks equal largest-remainder ties in input order without negative shares", () => {
    const values = averageToLayers({ qty: 40000n, value: 2n }, [
      { batchId: "a", remainingQty: 10000n },
      { batchId: "b", remainingQty: 10000n },
      { batchId: "c", remainingQty: 10000n },
      { batchId: "d", remainingQty: 10000n },
    ]).map((layer) => layer.value);
    expect(values).toEqual([1n, 1n, 0n, 0n]);
    expect(values.every((value) => value >= 0n)).toBe(true);
  });

  it("conserves value across 500 seeded random pool and batch sets", () => {
    let seed = 0x1398;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };

    for (let sample = 0; sample < 500; sample += 1) {
      const count = (random() % 6) + 1;
      const weights = Array.from({ length: count }, () =>
        BigInt((random() % 100000) + 1),
      );
      const qty = weights.reduce((sum, weight) => sum + weight, 0n);
      const value = BigInt(random() % 100000);
      const layers = averageToLayers(
        { qty, value },
        weights.map((remainingQty, index) => ({
          batchId: `batch-${index}`,
          remainingQty,
        })),
      );
      expect(layers.reduce((sum, layer) => sum + layer.value, 0n)).toBe(value);
      expect(layers.every((layer) => layer.value >= 0n)).toBe(true);
    }
  });

  it("returns no found-stock default when the pool has no reliable value", () => {
    expect(foundStockDefault({ qty: 0n, value: 0n }, 10000n)).toBeNull();
    expect(foundStockDefault({ qty: 10000n, value: 0n }, 10000n)).toBeNull();
    expect(foundStockDefault({ qty: 10000n, value: 1000n }, 5000n)).toBe(500n);
  });

  it("returns a scale-4 unit value or null when no quantity or value exists", () => {
    expect(unitValueScale4(30000n, 1000n)).toBe(33333n);
    expect(unitValueScale4(0n, 1000n)).toBeNull();
    expect(unitValueScale4(10000n, 0n)).toBeNull();
  });

  it("rejects impossible average and FIFO decreases", () => {
    expect(() => averageDecrease({ qty: 30000n, value: 1000n }, 0n)).toThrow();
    expect(() =>
      averageDecrease({ qty: 30000n, value: 1000n }, 30001n),
    ).toThrow();
    expect(() =>
      fifoConsume(
        [{ id: "a", remainingQty: 10000n, remainingValue: 100n }],
        10001n,
      ),
    ).toThrow(/cover/i);
  });

  it("allocates cents with earlier rows winning equal remainders", () => {
    expect(allocateCentsByWeight(2n, [1n, 1n, 1n, 1n])).toEqual([
      1n,
      1n,
      0n,
      0n,
    ]);
  });
});
