# AgentKey

**A passport for AI agents.** AgentKey gives each AI agent its own cryptographic identity that any app can check with one call, and that a leaked log or copied request can't be used to fake.

![AgentKey demo: issue an agent ID, verify a proof, block a replay, revoke](docs/demo.gif)

> **Status: prototype.** Working end to end (85 tests, CI), not security audited. See [what is and isn't protected](docs/threat-model.md).

## The problem

When an AI agent calls your API, you usually see an API key. That tells you which *account* is paying, not which *agent* is acting:

- **Keys get copied.** Whoever holds the key *is* the agent. One leak and anyone can impersonate it.
- **Every app invents its own accounts.** The same agent is a stranger in each new app, with nothing it can carry between them.
- **"Is this really agent X?" has no standard answer**, so apps either guess or skip the check.

## How it works

```
 1. Issue     The agent makes a key pair locally. AgentKey registers the public
              key and signs it, giving the agent an ID (ak_…). The private key
              never leaves the agent.

 2. Prove     The app asks for a one-time challenge. The agent signs it.

 3. Verify    One call answers:  valid · invalid · unknown · revoked · error
              Anything unexpected is a "no". It never fails open.
```

Every challenge **expires in 5 minutes, works once, and only for one purpose** (`verify`, `revoke`, or `resolve`). A proof someone intercepts is useless a second time, and a login proof can never be used to revoke the agent.

## Why not just…

| | What it answers | Where AgentKey differs |
| --- | --- | --- |
| **API keys** | "Which account?" | A key is a shared secret: copy it and you *are* the agent. AgentKey's private key never leaves the agent, and each proof works once. |
| **OAuth** | "What did a *user* allow this app to do?" | OAuth doesn't give the agent itself an identity that works across apps. They fit together: OAuth for *what's allowed*, AgentKey for *which agent*. |
| **mTLS / SPIFFE** | "Which service inside our infrastructure?" | Built for workloads inside one organisation. AgentKey targets agents calling across organisations, with MCP tools out of the box. |
| **DIDs / Verifiable Credentials** | "Who issued this claim?" | Closest idea. AgentKey is deliberately smaller: one verify call with a typed answer. IDs could map onto DIDs later. |

## Quickstart (4 commands, no blockchain)

```bash
git clone https://github.com/Rosh2403/AgentKey.git && cd AgentKey
pnpm install && pnpm build
pnpm --filter @agentkey/api dev          # terminal 1 (leave running on :8787)
pnpm example:quickstart                  # terminal 2
```

You'll see an agent issued, a proof come back `valid`, the same proof replayed and rejected as `invalid`, and a malformed proof rejected as `error`. Needs Node 20+ and pnpm. Full walkthrough: [examples/quickstart](./examples/quickstart/README.md).

## Use it from code

```ts
import { AgentkeyClient, agentKeys } from "@agentkey/sdk";

const client = new AgentkeyClient({ baseUrl: "http://127.0.0.1:8787" });

// Agent side: make keys and get an ID
const keys = agentKeys.generate();
const agent = await client.issue({ publicHandle: "research-bot", publicKey: keys.publicKey });

// App side: hand out a one-time challenge; the agent signs it
const { challenge } = await client.challenge("verify");
const proof = agentKeys.createProof({ agentId: agent.id, challenge, privateKey: keys.privateKey });

// App side: check it
const result = await client.verify({ agentId: agent.id, proof });
if (result.status !== "valid") throw new Error(`denied: ${result.status}`);
```

Prefer to choose the challenge yourself (e.g. a session ID)? Pass it as `expectedChallenge` to `verify` and the proof must match it exactly.

## Use it from an AI agent (MCP)

The same actions are MCP tools, so an agent can get and prove its identity without custom code:

| Tool | What it does |
| --- | --- |
| `agentkey_challenge` | Get a one-time challenge to sign |
| `agentkey_issue` | Register a handle and public key → Agent ID |
| `agentkey_resolve` | Look up an agent by ID or handle |
| `agentkey_verify` | Check a proof → typed status |
| `agentkey_revoke` | Revoke an ID (needs the agent's own proof); later checks return `revoked` |

## What verify returns

| Status | Meaning |
| --- | --- |
| `valid` | The agent proved it holds the key, over a fresh challenge |
| `invalid` | Wrong key, wrong agent, or a replayed / expired challenge |
| `unknown` | No such agent |
| `revoked` | The ID was revoked |
| `error` | Couldn't check safely (malformed proof, crypto or transport failure) → **deny** |

## Security, honestly

- **Protected:** impersonation without the private key, replayed proofs, using a login proof to revoke, reading an agent's private subject without its proof. Every failure path denies.
- **Not yet:** independent audit, rate limiting, multi-instance challenge store (in memory today), and a single root issuer. The single issuer is a bootstrap step; the plan is for verifiers to trust a *set* of issuers.

Details and residual risks: [docs/threat-model.md](docs/threat-model.md).

## What's in the repo

```
packages/protocol   Agent ID types, signed-message formats, verify statuses
packages/crypto     Ed25519 sign / verify that fails closed
packages/sdk        Client for apps and agents (issue, challenge, verify, revoke)
apps/api            HTTP API
apps/mcp            MCP tools (same handlers as the API)
apps/dashboard      Small web UI for trying it out
crates/agentkey-core  Rust verify core, checked against the same test fixtures
contracts/          Optional Solidity registry for public auditability
```

**Optional on-chain anchoring.** Everything above works with no blockchain. IDs that need a public audit trail can also be committed to an on-chain registry (ERC-8004 compatible adapter included). This started as a hackathon project on the Monad track; the pitch is in [PITCH.md](./PITCH.md) and contract details in [contracts/README.md](./contracts/README.md).

## Roadmap

- Shared challenge store (Redis) for running several API instances
- Trust a set of issuers instead of one root
- Optional binding of a human owner (passkey / WebAuthn) to an agent
- Rate limits on issuing

## Development

```bash
pnpm typecheck
pnpm test          # Node 22+ (the test glob needs it)
```

Optional dashboard: `pnpm --filter @agentkey/dashboard dev`.

Contributions welcome: conventional commits (`feat:`, `fix:`, `docs:`…), PRs against **`development`**. See [CONTRIBUTING.md](./CONTRIBUTING.md).
