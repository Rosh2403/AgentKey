# Agentkey dashboard

Minimal TypeScript web UI for the product surface: **resolve** by public handle, **verify** (challenge/sign or paste proof), and optional **issue** in local non-production mode.

Verify always displays a typed status (`valid` | `invalid` | `unknown` | `revoked` | `error`) and **fails closed** on transport/parse/crypto problems.

## Prerequisites

- Node ≥ 20, pnpm (see repo root)
- Local API running (`@agentkey/api`)

## Setup

From the monorepo root:

```bash
pnpm install
cp apps/dashboard/.env.example apps/dashboard/.env   # optional
```

Wire the API with the same host/port the API listens on (defaults `127.0.0.1:8787`):

| Variable | Purpose |
| --- | --- |
| `AGENTKEY_API_URL` | Vite proxy target (default `http://127.0.0.1:8787`) |
| `AGENTKEY_API_HOST` / `AGENTKEY_API_PORT` | Fallback if `AGENTKEY_API_URL` unset |
| `AGENTKEY_DASHBOARD_PORT` | Dev server port (default `5173`) |
| `VITE_AGENTKEY_API_URL` | Optional absolute API base in the browser (bypasses proxy) |

Leave `VITE_AGENTKEY_API_URL` empty for local dev so the UI calls `/v1` and `/health` through the Vite proxy. The API also sends CORS headers for direct browser calls when the env override is set.

**No secrets belong in the dashboard.** Subject private keys used for local challenge signing stay in the browser tab; issuer keys live only in the API process / your local `.env`.

## Run

Terminal 1 — API:

```bash
pnpm dev:api
```

Terminal 2 — dashboard:

```bash
pnpm dev:dashboard
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

### Suggested flow

1. Enable **local non-production mode** under Issue → register a handle (browser generates Ed25519 subject keys).
2. Confirm Resolve returns the public view (no private subject).
3. Under Verify → **Challenge & sign**, use the filled agent id + private key (or paste a proof JSON).
4. Confirm typed status; try a malformed proof and expect `error` (fail closed).

## Build

```bash
pnpm --filter @agentkey/dashboard build
pnpm --filter @agentkey/dashboard preview
```

## Notes

- Dual IDs: public handle for lookup; private subject only on authorized/local issue responses.
- Single root issuer is enforced by the API; the dashboard only calls it.
- Browser signing uses Web Crypto Ed25519 with the same hex wire format as `@agentkey/crypto`.
