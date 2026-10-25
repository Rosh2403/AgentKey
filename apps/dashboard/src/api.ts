import {
  failClosed,
  type AgentId,
  type IssueRequest,
  type VerifyResult,
  type VerifyStatus,
} from "@agentkey/protocol";

/** Browser base URL: absolute override, else same-origin (Vite proxy). */
export function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_AGENTKEY_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return "";
}

function url(path: string): string {
  return `${apiBaseUrl()}${path}`;
}

async function readJson(res: Response): Promise<unknown> {
  return (await res.json()) as unknown;
}

/** One-time challenge from the API (5 min, single use). */
export async function requestChallenge(
  purpose: "verify" | "revoke" | "resolve" = "verify",
): Promise<string> {
  const res = await fetch(url("/v1/challenges"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ purpose }),
  });
  const body = (await readJson(res)) as { challenge?: unknown };
  if (!res.ok || typeof body.challenge !== "string") {
    throw new Error(`challenge request failed (${res.status})`);
  }
  return body.challenge;
}

/**
 * Resolve by public handle or agent id.
 * Public resolve never returns privateSubject unless includePrivateSubject.
 */
export async function resolveAgent(
  idOrHandle: string,
  includePrivateSubject = false,
): Promise<AgentId> {
  const params = new URLSearchParams();
  if (includePrivateSubject) {
    params.set("includePrivateSubject", "true");
  }
  const q = params.toString();
  const path = `/v1/agents/${encodeURIComponent(idOrHandle)}${q ? `?${q}` : ""}`;
  const res = await fetch(url(path), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const body = await readJson(res);
  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `resolve failed (${res.status})`;
    throw new Error(err);
  }
  return body as AgentId;
}

/**
 * Verify ownership proof. Always returns a typed VerifyResult.
 * Transport/parse failures fail closed to `error` — never soft-allow.
 */
export async function verifyAgent(input: {
  agentId: string;
  proof: string;
}): Promise<VerifyResult> {
  try {
    if (!input.agentId?.trim() || !input.proof?.trim()) {
      return failClosed("agentId and proof are required");
    }
    const res = await fetch(url("/v1/verify"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        agentId: input.agentId.trim(),
        proof: input.proof.trim(),
      }),
    });
    try {
      const body = (await readJson(res)) as VerifyResult;
      if (
        body &&
        typeof body === "object" &&
        typeof body.status === "string" &&
        isVerifyStatus(body.status)
      ) {
        return body;
      }
      return failClosed("verify response missing typed status");
    } catch {
      return failClosed(`verify transport failure (${res.status})`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "transport failure";
    return failClosed(message);
  }
}

export async function issueAgent(request: IssueRequest): Promise<AgentId> {
  const res = await fetch(url("/v1/agents"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(request),
  });
  const body = await readJson(res);
  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `issue failed (${res.status})`;
    throw new Error(err);
  }
  return body as AgentId;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(url("/health"), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return false;
    const body = (await readJson(res)) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

function isVerifyStatus(value: string): value is VerifyStatus {
  return (
    value === "valid" ||
    value === "invalid" ||
    value === "unknown" ||
    value === "revoked" ||
    value === "error"
  );
}
