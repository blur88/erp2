/**
 * Cycle-safe ancestry helpers shared by structural validation AND category
 * grouping (spec §7.3). Detection alone is not enough: a cyclic chart must
 * still RENDER, so the traversal that builds rows has to terminate too. If
 * only the validator were cycle-aware, the warning would be computed and then
 * never reach the client because grouping would hang first.
 *
 * Every walk is bounded by a visited set. A node already visited is treated as
 * its own root for anchoring purposes and flagged `cyclic`.
 */

export interface GraphNode {
  id: string;
  parentId: string | null;
}

export function findRoot(
  id: string,
  byId: Map<string, GraphNode>,
): { rootId: string; cyclic: boolean } {
  const seen = new Set<string>();
  let currentId = id;

  for (;;) {
    if (seen.has(currentId)) return { rootId: currentId, cyclic: true };
    seen.add(currentId);

    const node = byId.get(currentId);
    // No node, or no parent, or a parent that does not resolve: this is the
    // top of the chain we can actually walk.
    if (!node || node.parentId === null || !byId.has(node.parentId)) {
      return { rootId: currentId, cyclic: false };
    }
    currentId = node.parentId;
  }
}

export function isDescendantOf(
  id: string,
  ancestorId: string,
  byId: Map<string, GraphNode>,
): boolean {
  const seen = new Set<string>();
  let currentId: string | null = id;

  while (currentId !== null) {
    if (currentId === ancestorId) return true;
    if (seen.has(currentId)) return false; // cycle — ancestor not on this chain
    seen.add(currentId);
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  return false;
}

export function detectCycles(nodes: GraphNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cyclic = nodes.filter((n) => findRoot(n.id, byId).cyclic).map((n) => n.id);
  return cyclic.sort();
}

export function detectDanglingParents(nodes: GraphNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes
    .filter((n) => n.parentId !== null && !byId.has(n.parentId))
    .map((n) => n.id)
    .sort();
}
