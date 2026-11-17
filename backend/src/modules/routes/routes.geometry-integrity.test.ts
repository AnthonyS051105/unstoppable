import { describe, expect, it } from 'vitest';
import { assembleRouteGeometry } from './route-geometry.js';
import type { PathEdgeRow } from './routes.types.js';
const edge = (id: number, coordinates: [number, number][]) => ({ edgeId: BigInt(id), geometry: { type: 'LineString', coordinates } }) as PathEdgeRow;
describe('survey route geometry integrity', () => {
  it('retains every surveyed bend and removes only a shared endpoint', () => {
    expect(assembleRouteGeometry([edge(1, [[110,-7],[110.001,-7.001],[110.002,-7]]), edge(2, [[110.002,-7],[110.003,-7]])]).coordinates)
      .toEqual([[110,-7],[110.001,-7.001],[110.002,-7],[110.003,-7]]);
  });
  it('rejects the production edge-30/24 discontinuity instead of dropping a vertex', () => {
    expect(() => assembleRouteGeometry([edge(30, [[110.3725,-7.7655],[110.3726,-7.7656]]), edge(24, [[110.3723,-7.7657],[110.3725,-7.7655]])])).toThrow(/tersambung/i);
  });
  it.each(([[], [[110,-7]], [[NaN,-7],[110,-7]], [[-7,110],[-7.1,110]], [[110,-7],[110,-7]]] as [number,number][][]).map(coordinates => ({coordinates})))('rejects malformed or horizontal zero-length geometry $coordinates', ({coordinates}) => {
    expect(() => assembleRouteGeometry([edge(1, coordinates)])).toThrow();
  });
  it('allows a coincident vertical edge between surveyed horizontal segments', () => {
    expect(assembleRouteGeometry([edge(1, [[110,-7],[110.001,-7]]), edge(2, [[110.001,-7],[110.001,-7]]), edge(3, [[110.001,-7],[110.002,-7]])]).coordinates).toEqual([[110,-7],[110.001,-7],[110.001,-7],[110.002,-7]]);
  });
});
