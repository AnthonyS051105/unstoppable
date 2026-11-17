export type ScreenPoint = { x: number; y: number };
export type ScreenRect = { left: number; top: number; right: number; bottom: number };

function intersects(a: ScreenPoint, b: ScreenPoint, rect: ScreenRect) {
  let min = 0, max = 1;
  for (const [p, q] of [[a.x - b.x, a.x - rect.left], [b.x - a.x, rect.right - a.x], [a.y - b.y, a.y - rect.top], [b.y - a.y, rect.bottom - a.y]]) {
    if (!p) { if (q < 0) return false; }
    else { const t = q / p; if (p < 0) min = Math.max(min, t); else max = Math.min(max, t); }
  }
  return min <= max;
}

/** Place the label in visible map space with a clear gap from every route segment. */
export function routeLabelPosition(lines: ScreenPoint[][], viewport: ScreenRect, width = 132, height = 58): ScreenPoint | null {
  const points = lines.flat();
  if (!points.length) return null;
  const anchor = points[Math.floor(points.length / 2)];
  const gap = 14;
  let best: ScreenPoint | null = null, score = Infinity;
  for (let y = viewport.top; y + height <= viewport.bottom; y += 12) {
    for (let x = viewport.left; x + width <= viewport.right; x += 12) {
      const rect = { left: x - gap, top: y - gap, right: x + width + gap, bottom: y + height + gap };
      if (lines.some((line) => line.some((p, i) => intersects(p, line[i + 1] || p, rect)))) continue;
      const distance = Math.hypot(x + width / 2 - anchor.x, y + height / 2 - anchor.y);
      if (distance < score) { best = { x, y }; score = distance; }
    }
  }
  return best;
}
