import type {
  AgentId,
  IssueRequest,
  ResolveRequest,
  VerifyRequest,
  VerifyResult,
} from "@agentkey/protocol";
import { failClosed } from "@agentkey/protocol";
import {
  createOwnershipProof,
  generateKeyPair,
  type KeyPairHex,
} from "@agentkey/crypto";

export interface AgentkeyClientOptions {
  baseUrl: string;
  /** Optional bearer for authorized private-subject resolve. */
  accessToken?: string;
}

/**
 * Minimal builder-facing client for issue / resolve / verify.
 * Verify transport failures fail closed (`status: "error"`).
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
    return this.getJson<AgentId>(path);
  }

  async verify(request: VerifyRequest): Promise<VerifyResult> {
    try {
      return await this.postJson<VerifyResult>("/v1/verify", request);
    } catch (err) {
      const message = err instanceof Error ? err.message : "transport failure";
      return failClosed(message);
    }
  }

  /** Revoke an agent by id or public handle. Subsequent verify → `revoked`. */
  async revoke(idOrHandle: string): Promise<AgentId> {
    const path = `/v1/agents/${encodeURIComponent(idOrHandle)}/revoke`;
    return this.postJson<AgentId>(path, {});
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (this.options.accessToken) {
      headers.authorization = `Bearer ${this.options.accessToken}`;
    }
    return headers;
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers(),
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
  IssueRequest,
  ResolveRequest,
  VerifyRequest,
  VerifyResult,
  KeyPairHex,
};
