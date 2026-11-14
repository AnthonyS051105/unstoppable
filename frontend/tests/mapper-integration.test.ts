import assert from "node:assert/strict";
import { test } from "node:test";
import { denial } from "../src/lib/access";
import { coordToPct, pctToCoord } from "../src/lib/geo";

test("denial role guard membatasi akses editor dan topology hanya untuk admin/mapper/volunteer dengan canMapData", () => {
  // Lansia (blind_user / mobility_user)
  assert.ok(denial({ role: "blind_user", verified: false, canCompanion: false, canMapData: false }, "editor"));
  assert.ok(denial({ role: "mobility_user", verified: false, canCompanion: false, canMapData: false }, "topology"));

  // Caregiver
  assert.ok(denial({ role: "caregiver", verified: false, canCompanion: false, canMapData: false }, "editor"));

  // Volunteer tanpa izin canMapData
  assert.ok(denial({ role: "volunteer", verified: true, canCompanion: true, canMapData: false }, "editor"));
  assert.ok(denial({ role: "volunteer", verified: false, canCompanion: false, canMapData: true }, "topology"));

  // Volunteer terverifikasi dengan canMapData
  assert.equal(denial({ role: "volunteer", verified: true, canCompanion: false, canMapData: true }, "editor"), null);
  assert.equal(denial({ role: "volunteer", verified: true, canCompanion: false, canMapData: true }, "topology"), null);

  // Admin
  assert.equal(denial({ role: "admin", verified: true, canCompanion: true, canMapData: true }, "editor"), null);
  assert.equal(denial({ role: "admin", verified: false, canCompanion: false, canMapData: false }, "topology"), null);
});

test("denial role guard membatasi antrean verifikasi dan review hanya untuk admin/mapper", () => {
  // Lansia
  assert.ok(denial({ role: "blind_user", verified: false, canCompanion: false, canMapData: false }, "verification"));
  assert.ok(denial({ role: "mobility_user", verified: false, canCompanion: false, canMapData: false }, "review"));

  // Relawan non-admin
  assert.ok(denial({ role: "volunteer", verified: true, canCompanion: true, canMapData: true }, "verification"));
  assert.ok(denial({ role: "volunteer", verified: true, canCompanion: true, canMapData: true }, "review"));
  assert.ok(denial({ role: "volunteer", verified: true, canCompanion: true, canMapData: true }, "volunteer-review"));

  // Admin
  assert.equal(denial({ role: "admin", verified: true, canCompanion: true, canMapData: true }, "verification"), null);
  assert.equal(denial({ role: "admin", verified: true, canCompanion: true, canMapData: true }, "review"), null);
  assert.equal(denial({ role: "admin", verified: true, canCompanion: true, canMapData: true }, "volunteer-review"), null);
});

test("konversi koordinat pctToCoord dan coordToPct konsisten untuk pemetaan node", () => {
  const origX = 45;
  const origY = 60;
  const [lng, lat] = pctToCoord(origX, origY);
  assert.ok(Number.isFinite(lng));
  assert.ok(Number.isFinite(lat));

  const backPct = coordToPct([lng, lat]);
  assert.equal(Math.round(backPct.x), origX);
  assert.equal(Math.round(backPct.y), origY);
});
