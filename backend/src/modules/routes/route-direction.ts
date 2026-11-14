import type { PathEdgeRow } from "./routes.types.js";

/** pgRouting's node is the start of this traversal, which may be the stored edge's target.
 * Reverse vertex order, never the [longitude, latitude] coordinate pairs.
 * The same oriented edge feeds both route geometry and spoken/text instructions.
 */
export function orientEdge(edge: PathEdgeRow, fromNodeId: bigint): PathEdgeRow {
  if (fromNodeId !== edge.targetNodeId) return edge;
  return {
    ...edge,
    sourceNodeId: edge.targetNodeId,
    targetNodeId: edge.sourceNodeId,
    geometry: { ...edge.geometry, coordinates: [...edge.geometry.coordinates].reverse() },
  };
}
