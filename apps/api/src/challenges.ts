import { randomBytes } from "node:crypto";
import {
  CHALLENGE_PREFIX,
  CHALLENGE_PURPOSES,
  type ChallengePurpose,
  type ChallengeResponse,
} from "@agentkey/protocol";

/**
 * One-time challenges (replay protection).
 *
 * A signature over a challenge proves key control, but on its own it never
 * expires: anyone who sees the proof could reuse it. So the server hands out
 * random challenges that are short-lived, single-use, and tied to one purpose.
 *
 * Stored in memory: fine for a single API instance. Running several instances
 * needs a shared store (e.g. Redis) behind the same three functions.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_OUTSTANDING = 100_000;

interface Entry {
  purpose: ChallengePurpose;
  expiresAt: number;
}

const outstanding = new Map<string, Entry>();

function ttlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.AGENTKEY_CHALLENGE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

function sweep(now: number): void {
  for (const [key, entry] of outstanding) {
    if (entry.expiresAt <= now) outstanding.delete(key);
  }
}

export function isChallengePurpose(value: unknown): value is ChallengePurpose {
  return (
    typeof value === "string" &&
    (CHALLENGE_PURPOSES as readonly string[]).includes(value)
  );
}

export function isServerChallenge(challenge: string): boolean {
  return challenge.startsWith(CHALLENGE_PREFIX);
}

export function issueChallenge(
  purpose: ChallengePurpose = "verify",
  now: number = Date.now(),
): ChallengeResponse {
  if (!isChallengePurpose(purpose)) {
    throw new Error(`purpose must be one of: ${CHALLENGE_PURPOSES.join(", ")}`);
  }
  if (outstanding.size >= MAX_OUTSTANDING) sweep(now);
  if (outstanding.size >= MAX_OUTSTANDING) {
    throw new Error("too many outstanding challenges; try again shortly");
  }
  const challenge = `${CHALLENGE_PREFIX}${randomBytes(24).toString("base64url")}`;
  const expiresAt = now + ttlMs();
  outstanding.set(challenge, { purpose, expiresAt });
  return { challenge, purpose, expiresAt: new Date(expiresAt).toISOString() };
}

export type ChallengeCheck = { ok: true } | { ok: false; reason: string };

/** Check without using it up (call before the signature check). */
export function checkChallenge(
  challenge: string,
  purpose: ChallengePurpose,
  now: number = Date.now(),
): ChallengeCheck {
  const entry = outstanding.get(challenge);
  if (!entry) {
    return { ok: false, reason: "challenge unknown or already used" };
  }
  if (entry.expiresAt <= now) {
    outstanding.delete(challenge);
    return { ok: false, reason: "challenge expired" };
  }
  if (entry.purpose !== purpose) {
    return {
      ok: false,
      reason: `challenge was issued for ${entry.purpose}, not ${purpose}`,
    };
  }
  return { ok: true };
}

/** Use up a challenge so the same proof can never be accepted again. */
export function consumeChallenge(challenge: string): void {
  outstanding.delete(challenge);
}

/** Test helper. */
export function resetChallenges(): void {
  outstanding.clear();
}
