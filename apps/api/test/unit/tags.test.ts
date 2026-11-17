import { describe, expect, it } from "vitest";
import { CUISINES, DIETARY } from "../../src/profile/tags.js";

describe.each([
  ["CUISINES", CUISINES],
  ["DIETARY", DIETARY],
])("%s", (_name, tags) => {
  it("has no duplicates", () => {
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("uses only lowercase letters and underscores", () => {
    for (const tag of tags) {
      expect(tag).toMatch(/^[a-z_]+$/);
    }
  });

  it("is not empty", () => {
    expect(tags.length).toBeGreaterThan(0);
  });
});
