import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentId } from "@agentkey/protocol";

/** Full record kept by the issuer (always includes private subject). */
export type StoredAgent = AgentId & { privateSubject: string };

/** Current on-disk schema. Bump when migrating (see docs/persistence.md). */
export const STORE_SCHEMA_VERSION = 1 as const;

const DEFAULT_STORE_PATH = "./.data/agents.json";

const agents = new Map<string, StoredAgent>();
const byHandle = new Map<string, string>();

export type StoreBackend = "memory" | "file";

/**
 * Backend selection:
 * - `AGENTKEY_STORE=memory|file` wins when set
 * - otherwise `file` when a path is configured or API opted into durable default
 * - otherwise `memory` (tests / unset)
 */
export function resolveStoreBackend(
  env: NodeJS.ProcessEnv = process.env,
): StoreBackend {
  const explicit = env.AGENTKEY_STORE?.trim().toLowerCase();
  if (explicit === "memory" || explicit === "file") {
    return explicit;
  }
  if (env.AGENTKEY_STORE_PATH?.trim()) {
    return "file";
  }
  if (env.AGENTKEY_STORE_DURABLE_DEFAULT === "1") {
    return "file";
  }
  return "memory";
}

export function resolveStorePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.AGENTKEY_STORE_PATH?.trim();
  return resolve(configured && configured.length > 0 ? configured : DEFAULT_STORE_PATH);
}

function persist(): void {
  if (resolveStoreBackend() !== "file") return;
  const path = resolveStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    version: STORE_SCHEMA_VERSION,
    agents: [...agents.values()],
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
}

function loadFromDisk(): void {
  if (resolveStoreBackend() !== "file") return;
  const path = resolveStorePath();
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      version?: number;
      agents?: StoredAgent[];
    };
    const version = raw.version ?? 1;
    if (version !== STORE_SCHEMA_VERSION) {
      // Unknown / future versions: refuse to load (fail closed for durability).
      throw new Error(
        `unsupported store schema version ${version}; expected ${STORE_SCHEMA_VERSION}`,
      );
    }
    for (const agent of raw.agents ?? []) {
      agents.set(agent.id, agent);
      byHandle.set(agent.publicHandle.toLowerCase(), agent.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "store load failed";
    // eslint-disable-next-line no-console
    console.error(`[agentkey] durable store load failed: ${message}`);
    // Leave maps empty — verify of unknown agents returns unknown/error paths.
  }
}

let loaded = false;
function ensureLoaded(): void {
  if (!loaded) {
    loadFromDisk();
    loaded = true;
  }
}

/** Enable file-backed default for the API process (production-like local use). */
export function enableDurableStoreDefault(): void {
  if (!process.env.AGENTKEY_STORE?.trim()) {
    process.env.AGENTKEY_STORE_DURABLE_DEFAULT = "1";
  }
  loaded = false;
  agents.clear();
  byHandle.clear();
  ensureLoaded();
}

export function putAgent(agent: StoredAgent): void {
  ensureLoaded();
  agents.set(agent.id, agent);
  byHandle.set(agent.publicHandle.toLowerCase(), agent.id);
  persist();
}

/**
 * Insert a brand-new agent only if neither id nor public handle is taken.
 * Atomic vs concurrent issue (avoids TOCTOU between getAgent check and put).
 * Updates (e.g. revoke) should keep using `putAgent`.
 */
export function putNewAgent(agent: StoredAgent): boolean {
  ensureLoaded();
  const handleKey = agent.publicHandle.toLowerCase();
  if (agents.has(agent.id) || byHandle.has(handleKey)) {
    return false;
  }
  agents.set(agent.id, agent);
  byHandle.set(handleKey, agent.id);
  persist();
  return true;
}

export function getAgent(idOrHandle: string): StoredAgent | undefined {
  ensureLoaded();
  const direct = agents.get(idOrHandle);
  if (direct) return direct;
  const id = byHandle.get(idOrHandle.toLowerCase());
  return id ? agents.get(id) : undefined;
}

export function listAgents(): StoredAgent[] {
  ensureLoaded();
  return [...agents.values()];
}

export function revokeAgent(idOrHandle: string): StoredAgent | undefined {
  const agent = getAgent(idOrHandle);
  if (!agent) return undefined;
  const revoked: StoredAgent = { ...agent, status: "revoked" };
  putAgent(revoked);
  return revoked;
}

/** Test helper — force memory backend and clear maps (no disk reload). */
export function clearStoreForTests(): void {
  process.env.AGENTKEY_STORE = "memory";
  delete process.env.AGENTKEY_STORE_DURABLE_DEFAULT;
  agents.clear();
  byHandle.clear();
  loaded = true;
}

/** Clear maps and allow reload from whatever backend env currently selects. */
export function resetStoreForTests(): void {
  agents.clear();
  byHandle.clear();
  loaded = false;
}
