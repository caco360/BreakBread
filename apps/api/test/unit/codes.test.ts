import { describe, expect, it } from "vitest";
import {
  emailDomain,
  generateCode,
  hashCode,
  hashesMatch,
  normalizeEmail,
} from "../../src/auth/codes.js";

const SECRET = "s".repeat(32);

describe("normalizeEmail", () => {
  it("trims spaces and lowercases", () => {
    expect(normalizeEmail(" Carl@Live.Concordia.CA ")).toBe("carl@live.concordia.ca");
  });
});

describe("emailDomain", () => {
  it("returns everything after the @", () => {
    expect(emailDomain("carl@live.concordia.ca")).toBe("live.concordia.ca");
  });

  it("does not stop early on a look-alike domain", () => {
    expect(emailDomain("a@live.concordia.ca.evil.com")).toBe("live.concordia.ca.evil.com");
  });

  it("uses the last @ when there are several", () => {
    expect(emailDomain("a@live.concordia.ca@evil.com")).toBe("evil.com");
  });
});

describe("generateCode", () => {
  it("always returns exactly 6 digits", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashCode", () => {
  const email = "carl@live.concordia.ca";

  it("gives the same hash for the same inputs", () => {
    expect(hashCode("123456", email, SECRET)).toBe(hashCode("123456", email, SECRET));
  });

  it("gives a different hash for a different code, email or secret", () => {
    const base = hashCode("123456", email, SECRET);

    expect(hashCode("123457", email, SECRET)).not.toBe(base);
    expect(hashCode("123456", "other@live.concordia.ca", SECRET)).not.toBe(base);
    expect(hashCode("123456", email, "t".repeat(32))).not.toBe(base);
  });

  it("does not contain the code", () => {
    expect(hashCode("123456", email, SECRET)).not.toContain("123456");
  });
});

describe("hashesMatch", () => {
  it("is true for equal hashes and false for different ones", () => {
    const a = hashCode("123456", "a@live.concordia.ca", SECRET);
    const b = hashCode("654321", "a@live.concordia.ca", SECRET);

    expect(hashesMatch(a, a)).toBe(true);
    expect(hashesMatch(a, b)).toBe(false);
  });

  it("is false, not an error, when the lengths differ", () => {
    expect(hashesMatch("abc", "abcdef")).toBe(false);
  });
});
