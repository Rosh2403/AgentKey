import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { IssueRequest, ResolveRequest, VerifyRequest } from "@agentkey/protocol";
import {
  issueAgent,
  resolveAgent,
  revokeAgentIdentity,
  verifyAgent,
} from "./handlers.js";
import { getIssuerKeys } from "./issuer.js";
import { enableDurableStoreDefault, resolveStoreBackend, resolveStorePath } from "./store.js";

const host = process.env.AGENTKEY_API_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENTKEY_API_PORT ?? "8787");

// Production-like local default: durable file store unless AGENTKEY_STORE=memory.
enableDurableStoreDefault();

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, accept",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...corsHeaders,
  });
  res.end(payload);
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${host}:${port}`);
  const { pathname } = url;

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, { ok: true, service: "agentkey-api" });
      return;
    }

    if (req.method === "POST" && pathname === "/v1/agents") {
      const body = (await readJson(req)) as IssueRequest;
      const agent = await issueAgent(body);
      sendJson(res, 201, agent);
      return;
    }

    const revokeMatch = pathname.match(/^\/v1\/agents\/([^/]+)\/revoke$/);
    if (req.method === "POST" && revokeMatch) {
      const idOrHandle = decodeURIComponent(revokeMatch[1] ?? "");
      const result = await revokeAgentIdentity(idOrHandle);
      if ("error" in result) {
        sendJson(res, 404, result);
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    const resolveMatch = pathname.match(/^\/v1\/agents\/([^/]+)$/);
    if (req.method === "GET" && resolveMatch) {
      const idOrHandle = decodeURIComponent(resolveMatch[1] ?? "");
      const request: ResolveRequest = {
        idOrHandle,
        includePrivateSubject:
          url.searchParams.get("includePrivateSubject") === "true",
      };
      const result = resolveAgent(request);
      if ("error" in result) {
        sendJson(res, 404, result);
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/v1/verify") {
      const body = (await readJson(req)) as VerifyRequest;
      const result = verifyAgent(body);
      // Fail closed: parse/crypto errors → status error (HTTP 400).
      const httpStatus = result.status === "error" ? 400 : 200;
      sendJson(res, httpStatus, result);
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error";
    if (pathname === "/v1/verify") {
      sendJson(res, 400, { status: "error", reason: message });
      return;
    }
    sendJson(res, 400, { error: message });
  }
}

// Ensure issuer keys are loaded at boot (ephemeral warning if unset).
getIssuerKeys();

const server = createServer((req, res) => {
  void handler(req, res);
});

server.listen(port, host, () => {
  const backend = resolveStoreBackend();
  const storeInfo =
    backend === "file" ? `file:${resolveStorePath()}` : "memory";
  // eslint-disable-next-line no-console
  console.log(
    `agentkey api listening on http://${host}:${port} (store=${storeInfo})`,
  );
});
