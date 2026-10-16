import { describe, expect, it } from "vitest";
import { feedbackSchema } from "./sessions.schema.js";

describe("session feedback schema", () => {
  it.each([1, 3, 5])("accepts rating %s", (rating) => {
    expect(feedbackSchema.parse({ rating })).toEqual({ rating });
  });

  it.each([0, 2, 4, 6, "5", null])("rejects rating %s", (rating) => {
    expect(() => feedbackSchema.parse({ rating })).toThrow();
  });

  it("rejects extra fields", () => {
    expect(() => feedbackSchema.parse({ rating: 5, comment: "ok" })).toThrow();
  });
});
