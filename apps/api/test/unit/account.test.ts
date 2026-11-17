import { describe, expect, it } from "vitest";
import { isAccountComplete, toAccountJson, type UserRow } from "../../src/profile/account.js";

// A user who has filled in everything.
const completeUser: UserRow = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "student@live.concordia.ca",
  first_name: "Sam",
  last_name: "Tester",
  bio: "Always hungry.",
  age_confirmed_at: new Date("2026-11-01T12:00:00Z"),
};

describe("isAccountComplete", () => {
  it("is true when first name, last name and the 18+ confirmation are all set", () => {
    expect(isAccountComplete(completeUser)).toBe(true);
  });

  it("is still true without a bio, because the bio is optional", () => {
    expect(isAccountComplete({ ...completeUser, bio: null })).toBe(true);
  });

  it.each(["first_name", "last_name", "age_confirmed_at"] as const)(
    "is false when %s is missing",
    (field) => {
      expect(isAccountComplete({ ...completeUser, [field]: null })).toBe(false);
    },
  );
});

describe("toAccountJson", () => {
  it("converts a database row to the JSON the app receives", () => {
    expect(toAccountJson(completeUser)).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "student@live.concordia.ca",
      firstName: "Sam",
      lastName: "Tester",
      bio: "Always hungry.",
      isAdult: true,
      complete: true,
    });
  });

  it("reports a brand-new user as not adult-confirmed and not complete", () => {
    const newUser: UserRow = {
      ...completeUser,
      first_name: null,
      last_name: null,
      bio: null,
      age_confirmed_at: null,
    };

    expect(toAccountJson(newUser)).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "student@live.concordia.ca",
      firstName: null,
      lastName: null,
      bio: null,
      isAdult: false,
      complete: false,
    });
  });
});
