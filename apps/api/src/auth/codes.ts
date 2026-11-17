// Pure functions for login codes: no database, no network.
// That is what lets them be unit tested without Docker.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// A code works for 10 minutes.
export const CODE_TTL_MS = 10 * 60 * 1000;
// After 5 wrong tries the code is dead and a new one must be requested.
export const MAX_ATTEMPTS = 5;
// A new code can be requested for the same email once every 60 seconds.
export const RESEND_WAIT_MS = 60 * 1000;

// " Student@Live.Concordia.CA " and "student@live.concordia.ca" are the same inbox,
// so they must become the same text before we compare or store anything.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Everything after the last "@". For "a@live.concordia.ca.evil.com" this is
// "live.concordia.ca.evil.com", which will not match "live.concordia.ca".
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

// A random 6-digit code such as "042917".
export function generateCode(): string {
  // randomInt uses the operating system's secure random source.
  // Math.random() must not be used here: its output can be predicted.
  const number = randomInt(0, 1_000_000);
  // padStart keeps leading zeros: 42917 becomes "042917".
  return number.toString().padStart(6, "0");
}

// Turns a code into the value we store.
//
// A plain hash is not enough: there are only 1,000,000 possible codes, so
// someone who stole the table could hash all of them and find the match in
// under a second. HMAC mixes in a secret that is not in the database, so the
// stolen table alone is useless.
//
// The email is included so the same code for two people gives two different
// hashes.
export function hashCode(code: string, email: string, secret: string): string {
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

// Compares two hashes without leaking how many characters matched.
// A normal === stops at the first different character, so it answers very
// slightly faster for a worse guess. timingSafeEqual always takes the same time.
export function hashesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  // timingSafeEqual throws if the lengths differ, so check that first.
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
