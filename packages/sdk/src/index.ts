import {
  failClosed,
  type AgentId,
  type IssueRequest,
  type ResolveRequest,
  type VerifyRequest,
  type VerifyResult,
} from "./wire.js";
import {
  createOwnershipProof,
  generateKeyPair,
  type KeyPairHex,
} from "./keys.js";

export interface AgentkeyClientOptions {
  baseUrl: string;
  /**
   * Optional issuer-admin bearer (`AGENTKEY_ISSUER_ADMIN_TOKEN` on the API).
   * Off by default on the server — only useful when that env is explicitly set.
   */
  accessToken?: string;
}

/**
 * Minimal builder-facing client for issue / resolve / verify / revoke.
 * Verify transport failures fail closed (`status: "error"`).
 *
 * Zero workspace deps — install from git:
 *   `"@agentkey/sdk": "github:Rosh2403/AgentKey#main&path:packages/sdk"`
 */
export class AgentkeyClient {
  constructor(private readonly options: AgentkeyClientOptions) {}

  async issue(request: IssueRequest): Promise<AgentId> {
    return this.postJson<AgentId>("/v1/agents", request);
  }

  async resolve(request: ResolveRequest): Promise<AgentId> {
    const params = new URLSearchParams();
    if (request.includePrivateSubject) {
      params.set("includePrivateSubject", "true");
    }
    const q = params.toString();
    const path = `/v1/agents/${encodeURIComponent(request.idOrHandle)}${q ? `?${q}` : ""}`;
    const extra: Record<string, string> = {};
    if (request.proof) {
      extra["x-agentkey-proof"] = request.proof;
    }
    return this.getJson<AgentId>(path, extra);
  }

  /**
   * Get a one-time challenge for the agent to sign. Expires in ~5 minutes and
   * works once, for one purpose (`verify`, `revoke` or `resolve`).
   */
  async challenge(purpose: ChallengePurpose = "verify"): Promise<ChallengeResponse> {
    return this.postJson<ChallengeResponse>("/v1/challenges", { purpose });
  }

  async verify(request: VerifyRequest): Promise<VerifyResult> {
    try {
      return await this.postJson<VerifyResult>("/v1/verify", request);
    } catch (err) {
      const message = err instanceof Error ? err.message : "transport failure";
      return failClosed(message);
    }
  }

  /**
   * Revoke an agent by id or public handle.
   * Requires ownership `proof` (preferred) or issuer-admin `accessToken`.
   */
  async revoke(
    idOrHandle: string,
    options: Pick<RevokeRequest, "proof"> = {},
  ): Promise<AgentId> {
    const path = `/v1/agents/${encodeURIComponent(idOrHandle)}/revoke`;
    const body: Record<string, string> = {};
    if (options.proof) {
      body.proof = options.proof;
    }
    return this.postJson<AgentId>(path, body);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      ...extra,
    };
    if (this.options.accessToken) {
      headers.authorization = `Bearer ${this.options.accessToken}`;
    }
    return headers;
  }

  private async getJson<T>(
    path: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers(extraHeaders),
    });
    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Verify endpoints return typed VerifyResult even on HTTP 400.
      if (path === "/v1/verify") {
        try {
          return (await res.json()) as T;
        } catch {
          throw new Error(`POST ${path} failed: ${res.status}`);
        }
      }
      throw new Error(`POST ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }
}

/** Convenience: generate subject keypair + ownership proof helpers. */
export const agentKeys = {
  generate: (): KeyPairHex => generateKeyPair(),
  createProof: createOwnershipProof,
};

export type {
  AgentId,
  ChallengePurpose,
  ChallengeResponse,
  IssueRequest,
  ResolveRequest,
  RevokeRequest,
  VerifyRequest,
  VerifyResult,
  KeyPairHex,
};

export type { VerifyStatus, AgentStatus } from "./wire.js";
export { failClosed } from "./wire.js";
