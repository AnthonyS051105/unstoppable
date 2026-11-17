import { AppError } from '../../shared/errors.js';
import type { GeoJsonLineString, PathEdgeRow } from './routes.types.js';

function invalidGeometry(): never {
  throw new AppError('ROUTE_UNREACHABLE', 'Geometri jalur survei tidak tersambung. Rute belum dapat ditampilkan dengan aman.', 422, {
    reasons: [{ type: 'no_path_in_graph', message: 'Geometri survei tidak tersambung; data graf perlu diperiksa.' }],
    nearestReachablePoint: null, suggestion: 'request_companion',
  });
}
const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
/** Only remove a vertex proven to be shared. Never bridge a missing survey segment. */
export function assembleRouteGeometry(edges: PathEdgeRow[]): GeoJsonLineString {
  const coordinates: [number, number][] = [];
  for (const edge of edges) {
    const line = edge.geometry;
    if (line?.type !== 'LineString' || !Array.isArray(line.coordinates) || line.coordinates.length < 2) invalidGeometry();
    for (const point of line.coordinates) {
      if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) invalidGeometry();
    }
    if (coordinates.length && !same(coordinates.at(-1)!, line.coordinates[0]!)) invalidGeometry();
    coordinates.push(...(coordinates.length ? line.coordinates.slice(1) : line.coordinates));
  }
  if (coordinates.length < 2 || coordinates.every(p => same(p, coordinates[0]!))) invalidGeometry();
  return { type: 'LineString', coordinates };
}
