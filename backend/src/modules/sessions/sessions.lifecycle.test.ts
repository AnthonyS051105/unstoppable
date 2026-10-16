import { describe, expect, it } from "vitest";
import { clampArrivalRadius } from "./sessions.service.js";

describe("session lifecycle helpers", () => {
  it("uses the minimum arrival radius when accuracy is missing", () => {
    expect(clampArrivalRadius()).toBe(25);
  });

  it("clamps small GPS accuracy to 25 meters", () => {
    expect(clampArrivalRadius(8)).toBe(25);
  });

  it("preserves accuracy inside the safe range", () => {
    expect(clampArrivalRadius(45)).toBe(45);
  });

  it("clamps large GPS accuracy to 60 meters", () => {
    expect(clampArrivalRadius(120)).toBe(60);
  });
});
