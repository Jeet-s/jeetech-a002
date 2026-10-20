/**
 * App lock — PIN + biometric (UF7, free for everyone).
 *
 * The PIN is never stored: we keep a salted, iterated hash. This module ships a
 * pure, deterministic KDF stand-in so the rules are fully testable; the app
 * swaps in Argon2id (expo-crypto / native) behind the same `hashPin` contract —
 * the invariant that matters (hash ≠ plaintext, salt present) holds either way.
 * Forgetting the PIN can only be cleared by restoring a backup (see backup.ts).
 */
import { compareDateTime, addMinutes, type ISODateTime } from "./dates";
import {
  type LockConfig,
  type MoodState,
  type DomainError,
  LOCK_COOLDOWN_MINUTES,
  MAX_PIN_ATTEMPTS,
  PIN_MAX_LEN,
  PIN_MIN_LEN,
} from "./model";

/** A 4–6 digit numeric PIN. */
export function validatePin(pin: string): DomainError | null {
  if (!/^\d+$/.test(pin)) return "bad_pin";
  if (pin.length < PIN_MIN_LEN || pin.length > PIN_MAX_LEN) return "bad_pin";
  return null;
}

/**
 * Deterministic salted-and-iterated hash (FNV-1a core, many rounds). Not a
 * production KDF — the app substitutes Argon2id — but non-reversible and stable
 * so tests can assert hashing behaviour.
 */
export function hashPin(pin: string, salt: string): string {
  const data = `${salt}:${pin}`;
  let h = 0x811c9dc5 >>> 0;
  for (let round = 0; round < 4096; round++) {
    for (let i = 0; i < data.length; i++) {
      h ^= data.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= round + 0x9e3779b9;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `h1$${("00000000" + h.toString(16)).slice(-8)}`;
}

/** Set (or change) the PIN. Salt comes from the caller (secure RNG in the app). */
export function setPin(s: MoodState, pin: string, salt: string): { state: MoodState; error: DomainError | null } {
  const error = validatePin(pin);
  if (error) return { state: s, error };
  const lock: LockConfig = { ...s.lock, enabled: true, pinHash: hashPin(pin, salt), salt, failedAttempts: 0, lockedUntil: null };
  return { state: { ...s, lock }, error: null };
}

export function setBiometric(s: MoodState, on: boolean): MoodState {
  return { ...s, lock: { ...s.lock, biometric: on } };
}
export function setAutoLockMinutes(s: MoodState, minutes: number): MoodState {
  return { ...s, lock: { ...s.lock, autoLockMinutes: Math.max(0, Math.round(minutes)) } };
}

/** Is the lock currently in a failed-attempt cool-down at `now`? */
export function isCoolingDown(lock: LockConfig, now: ISODateTime): boolean {
  return !!lock.lockedUntil && compareDateTime(now, lock.lockedUntil) < 0;
}

/**
 * Check a PIN. On success resets attempts; on failure increments and, at
 * MAX_PIN_ATTEMPTS, starts a local cool-down. Never locks the user out for good.
 */
export function verifyPin(s: MoodState, pin: string, now: ISODateTime): { state: MoodState; ok: boolean; error: DomainError | null } {
  if (!s.lock.enabled || !s.lock.pinHash || !s.lock.salt) return { state: s, ok: true, error: null };
  if (isCoolingDown(s.lock, now)) return { state: s, ok: false, error: "locked" };
  const ok = hashPin(pin, s.lock.salt) === s.lock.pinHash;
  if (ok) return { state: { ...s, lock: { ...s.lock, failedAttempts: 0, lockedUntil: null } }, ok: true, error: null };
  const failedAttempts = s.lock.failedAttempts + 1;
  const lockedUntil = failedAttempts >= MAX_PIN_ATTEMPTS ? addMinutes(now, LOCK_COOLDOWN_MINUTES) : s.lock.lockedUntil;
  return { state: { ...s, lock: { ...s.lock, failedAttempts, lockedUntil } }, ok: false, error: "wrong_pin" };
}

/** Disable the lock when you know the PIN (Settings → turn off). */
export function disableLock(s: MoodState, pin: string, now: ISODateTime): { state: MoodState; error: DomainError | null } {
  const res = verifyPin(s, pin, now);
  if (!res.ok) return { state: res.state, error: res.error ?? "wrong_pin" };
  return { state: { ...res.state, lock: { enabled: false, pinHash: null, salt: null, biometric: false, autoLockMinutes: 0, failedAttempts: 0, lockedUntil: null } }, error: null };
}

/** Should the app auto-lock now, given when it last went to background? */
export function shouldAutoLock(lock: LockConfig, lastActiveAt: ISODateTime, now: ISODateTime): boolean {
  if (!lock.enabled) return false;
  if (lock.autoLockMinutes <= 0) return true;
  return compareDateTime(addMinutes(lastActiveAt, lock.autoLockMinutes), now) <= 0;
}
