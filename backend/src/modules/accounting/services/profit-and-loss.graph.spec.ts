import { findRoot, isDescendantOf, detectCycles, detectDanglingParents } from './profit-and-loss.graph';
import type { GraphNode } from './profit-and-loss.graph';

const toMap = (nodes: GraphNode[]) => new Map(nodes.map((n) => [n.id, n]));

describe('findRoot', () => {
  it('walks to the top-level ancestor', () => {
    const m = toMap([
      { id: 'root', parentId: null },
      { id: 'mid', parentId: 'root' },
      { id: 'leaf', parentId: 'mid' },
    ]);
    expect(findRoot('leaf', m)).toEqual({ rootId: 'root', cyclic: false });
  });

  it('returns the node itself when it is a root', () => {
    const m = toMap([{ id: 'root', parentId: null }]);
    expect(findRoot('root', m)).toEqual({ rootId: 'root', cyclic: false });
  });

  it('treats a dangling parent as making this node its own root', () => {
    const m = toMap([{ id: 'orphan', parentId: 'missing' }]);
    expect(findRoot('orphan', m)).toEqual({ rootId: 'orphan', cyclic: false });
  });

  // The load-bearing case: must TERMINATE, not hang.
  it('terminates on a cycle and reports it', () => {
    const m = toMap([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]);
    const res = findRoot('a', m);
    expect(res.cyclic).toBe(true);
    expect(['a', 'b']).toContain(res.rootId);
  });

  it('terminates on a self-referencing node', () => {
    const m = toMap([{ id: 'a', parentId: 'a' }]);
    expect(findRoot('a', m).cyclic).toBe(true);
  });
});

describe('isDescendantOf', () => {
  const m = toMap([
    { id: 'root', parentId: null },
    { id: 'mid', parentId: 'root' },
    { id: 'leaf', parentId: 'mid' },
    { id: 'other', parentId: null },
  ]);

  it('is true for a transitive descendant', () => {
    expect(isDescendantOf('leaf', 'root', m)).toBe(true);
  });

  it('is true for the node itself (a subtree includes its root)', () => {
    expect(isDescendantOf('mid', 'mid', m)).toBe(true);
  });

  it('is false for an unrelated node', () => {
    expect(isDescendantOf('other', 'root', m)).toBe(false);
  });

  it('terminates on a cycle rather than hanging', () => {
    const cyclic = toMap([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]);
    expect(isDescendantOf('a', 'zzz', cyclic)).toBe(false);
  });
});

describe('detectCycles', () => {
  it('returns [] for an acyclic tree', () => {
    expect(detectCycles([
      { id: 'root', parentId: null },
      { id: 'leaf', parentId: 'root' },
    ])).toEqual([]);
  });

  it('names every node on a cycle', () => {
    expect(detectCycles([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'ok', parentId: null },
    ])).toEqual(['a', 'b']);
  });
});

describe('detectDanglingParents', () => {
  it('returns [] when every parent resolves', () => {
    expect(detectDanglingParents([
      { id: 'root', parentId: null },
      { id: 'leaf', parentId: 'root' },
    ])).toEqual([]);
  });

  it('names nodes whose parent is absent', () => {
    expect(detectDanglingParents([
      { id: 'orphan', parentId: 'gone' },
      { id: 'root', parentId: null },
    ])).toEqual(['orphan']);
  });
});
