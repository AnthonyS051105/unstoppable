import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BuildingAccessibilityScore } from '../src/types/api';

async function render(score: BuildingAccessibilityScore) {
  const path = '../src/components/buildings/BuildingScore';
  const component = await import(path).catch(() => null);
  assert.ok(component?.BuildingScore, 'Building score presentation must exist');
  return renderToStaticMarkup(createElement(component.BuildingScore, { score }));
}

test('renders aggregate score, all four facility aspects, evidence and advocacy action', async () => {
  const html = await render({ id: 'b', buildingId: 'b', name: 'Gedung Uji', accessibilityScore: 55,
    scoreBreakdown: {
      entrance: { score: 100, note: 'Pintu tanpa tangga.' },
      verticalAccess: { score: 0, note: 'Tidak ada lift.' },
      paths: { score: 100, note: 'Jalur telah diukur.' },
      facilities: { score: 0, note: 'Toilet difabel tidak tersedia.' },
    },
  });
  for (const text of ['55/100', 'Guiding block', 'Ramp', 'Toilet ramah lansia', 'Lift', 'Tidak ada lift.', 'Prioritas advokasi', '/report']) assert.ok(html.includes(text), text);
  assert.match(html, /guiding block belum dinilai/i);
  assert.match(html, /ramp belum dinilai/i);
});

test('renders unsurveyed facilities as unavailable instead of a zero score', async () => {
  const html = await render({ id: 'b', buildingId: 'b', name: 'Belum disurvei', accessibilityScore: null, scoreBreakdown: null });
  assert.match(html, /Belum disurvei/);
  assert.match(html, /Data belum tersedia/);
  assert.doesNotMatch(html, /0\/100/);
  assert.match(html, /Jadwalkan survei/);
});
