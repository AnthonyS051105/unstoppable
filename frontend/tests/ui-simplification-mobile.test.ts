import { test } from "node:test";
import assert from "node:assert/strict";
import { activeNav, denial, isValidLoginIdentifier, navItems } from "../src/lib/access";
import { initialState } from "../src/lib/demo-state";

test("senior primary navigation is distilled to 4 labeled items while keeping secondary routes accessible", () => {
  const senior = { ...initialState(), role: "blind_user" as const };
  const items = navItems(senior);

  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((it) => [it[0], it[2]]),
    [
      ["home", "Beranda"],
      ["assistance", "Bantuan"],
      ["report", "Lapor"],
      ["settings", "Pengaturan"],
    ],
  );

  // Secondary routes remain permitted for senior roles and highlight Menu & Pengaturan
  for (const secondaryRoute of ["caregiver-link", "communities", "community", "saved", "history", "profile"]) {
    assert.equal(denial(senior, secondaryRoute), null, `${secondaryRoute} must remain accessible to senior`);
    assert.equal(activeNav(items, secondaryRoute), "settings", `${secondaryRoute} should map to settings nav item`);
  }

  // Planner and route comparison remain permitted and map to home
  for (const homeRoute of ["home", "search", "ai-planner", "compare", "place", "places", "preview", "trip"]) {
    assert.equal(denial(senior, homeRoute), null, `${homeRoute} must remain accessible to senior`);
    assert.equal(activeNav(items, homeRoute), "home", `${homeRoute} should map to home nav item`);
  }
});

test("isValidLoginIdentifier accepts documented README demo phone numbers and emails and rejects invalid inputs", () => {
  // All four documented README demo phone numbers
  for (const demoPhone of ["081234567890", "081234567891", "081234567892", "081234567893"]) {
    assert.equal(isValidLoginIdentifier(demoPhone), true, `README demo phone ${demoPhone} must be accepted`);
  }

  // Formatted phone numbers and emails
  assert.equal(isValidLoginIdentifier("0812-3456-7890"), true);
  assert.equal(isValidLoginIdentifier("+62 812 3456 7890"), true);
  assert.equal(isValidLoginIdentifier("sari@unstoppable.id"), true);
  assert.equal(isValidLoginIdentifier("  budi.santoso@gmail.com  "), true);

  // Invalid identifiers must be rejected before API submission
  assert.equal(isValidLoginIdentifier(""), false);
  assert.equal(isValidLoginIdentifier("   "), false);
  assert.equal(isValidLoginIdentifier("12345"), false);
  assert.equal(isValidLoginIdentifier("08123abc890"), false);
  assert.equal(isValidLoginIdentifier("bukan-email"), false);
  assert.equal(isValidLoginIdentifier("bukan-email@"), false);
  assert.equal(isValidLoginIdentifier("@domain.com"), false);
});
