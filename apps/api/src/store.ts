import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentId } from "@agentkey/protocol";

/** Full record kept by the issuer (always includes private subject). */
export type StoredAgent = AgentId & { privateSubject: string };

const agents = new Map<string, StoredAgent>();
const byHandle = new Map<string, string>();

function storePath(): string | undefined {
  const path = process.env.AGENTKEY_STORE_PATH?.trim();
  return path ? path : undefined;
}

function persist(): void {
  const path = storePath();
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    agents: [...agents.values()],
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
}

function loadFromDisk(): void {
  const path = storePath();
  if (!path || !existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      agents?: StoredAgent[];
    };
    for (const agent of raw.agents ?? []) {
      agents.set(agent.id, agent);
      byHandle.set(agent.publicHandle.toLowerCase(), agent.id);
    }
  } catch {
    // Fail closed at verify time if store is corrupt; issue/resolve will see empty/partial.
  }
}

let loaded = false;
function ensureLoaded(): void {
  if (!loaded) {
    loadFromDisk();
    loaded = true;
  }
}

export function putAgent(agent: StoredAgent): void {
  ensureLoaded();
  agents.set(agent.id, agent);
  byHandle.set(agent.publicHandle.toLowerCase(), agent.id);
  persist();
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

/** Test helper — clear in-memory maps (and skip disk reload until reset). */
export function clearStoreForTests(): void {
  agents.clear();
  byHandle.clear();
  loaded = true;
}

export function resetStoreForTests(): void {
  agents.clear();
  byHandle.clear();
  loaded = false;
}
