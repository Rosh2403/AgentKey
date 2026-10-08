import type { AgentId } from "@agentkey/protocol";

/** In-memory stub store — replace with durable store later. */
const agents = new Map<string, AgentId>();
const byHandle = new Map<string, string>();

export function putAgent(agent: AgentId): void {
  agents.set(agent.id, agent);
  byHandle.set(agent.publicHandle.toLowerCase(), agent.id);
}

export function getAgent(idOrHandle: string): AgentId | undefined {
  const direct = agents.get(idOrHandle);
  if (direct) return direct;
  const id = byHandle.get(idOrHandle.toLowerCase());
  return id ? agents.get(id) : undefined;
}

export function listAgents(): AgentId[] {
  return [...agents.values()];
}
