# Agentkey persistence

## Choice (hardening slice)

**File-backed JSON store** with an explicit schema version.

| Item | Value |
| --- | --- |
| Backend | `file` (default for API process) or `memory` (tests / ephemeral) |
| Path | `AGENTKEY_STORE_PATH` (default `./.data/agents.json`) |
| Format | `{ "version": 1, "agents": [ … ] }` |
| Why not SQLite yet | Zero native deps; works on every CI runner; enough for single-node local / early prod-like use |

`.data/` is gitignored. Private subjects live in the store file — protect the path like any secret-adjacent data.

## Env

```bash
# memory | file — API defaults to file; tests should set memory
AGENTKEY_STORE=file
AGENTKEY_STORE_PATH=./.data/agents.json
```

## Migration path → SQLite

Keep the same logical row shape as `StoredAgent` (`id`, handles, keys, status, attestation, …).

1. Bump store `version` to `2` and introduce a SQLite file (e.g. `.data/agents.sqlite`) behind the same `putAgent` / `getAgent` / `revokeAgent` surface.
2. On first open of a `version: 1` JSON file, import rows into SQLite and leave or archive the JSON.
3. Do not change HTTP/MCP/SDK contracts — only the store adapter.

Until that lands, treat the JSON file as the durable source of truth for local deployments.
