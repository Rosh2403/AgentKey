# Countersign ← Agentkey bridge handoff

`cursor[bot]` cannot push to `AfshalG/countersign` or `Rosh2403/countersign`.
This folder is the apply-and-PR handoff for a human collaborator (Rosh / Afshal).

## Companion (merged)

- AgentKey SDK git-installable: https://github.com/Rosh2403/AgentKey/pull/15 (merged into `main`)
- Dependency: `"@agentkey/sdk": "github:Rosh2403/AgentKey#main&path:packages/sdk"`

## What the patch does

- Adds `@countersign/agentkey-bridge` (ERC-8004 id ↔ Agentkey id + fail-closed `verify`)
- Gates gateway `POST /v1/payments` and `POST /v1/runs` behind `AGENTKEY_VERIFY_ENABLED`
- Optional MCP/SDK `agentkey` proof passthrough
- Docs: `docs/developers/agentkey.md`
- Off by default — existing testnet demos unchanged

Patch base: **AfshalG/countersign `development`** @ `b97a404`.

## Apply + open PR (Rosh, write access on AfshalG/countersign)

AgentKey is private — use `gh` (authenticated) or clone, not anonymous raw.githubusercontent.com.

```bash
git clone https://github.com/AfshalG/countersign.git
cd countersign
git fetch origin development
git checkout development
git pull origin development
git checkout -b feature/agentkey-bridge

# Fetch patch from AgentKey handoff branch (authenticated)
gh api -H "Accept: application/vnd.github.raw" \
  "repos/Rosh2403/AgentKey/contents/handoff/countersign-agentkey-bridge.patch?ref=cursor/countersign-bridge-handoff-15be" \
  > agentkey-bridge.patch

git am agentkey-bridge.patch
# Already pins @agentkey/sdk to github:Rosh2403/AgentKey#main&path:packages/sdk

pnpm install
pnpm exec vitest run packages/agentkey-bridge services/gateway/test/agentkey-gate.test.ts

git push -u origin feature/agentkey-bridge

gh pr create --repo AfshalG/countersign --base development --draft \
  --title 'feat(gateway): Agentkey verify gate before pay' \
  --body "$(cat <<'BODY'
## Why

Track 04: **Agentkey = who**, **Countersign = may this agent pay**. Thin bridge — two repos stay separate; Countersign depends on Agentkey SDK (no monorepo merge).

## What

- `@countersign/agentkey-bridge` → `@agentkey/sdk` verify (**fail closed**; never soft-allow on `error`)
- Gateway choke: `POST /v1/payments` + `POST /v1/runs` return **403** `agentkey_verify_failed` when gate is on and verify ≠ `valid`
- Env (off by default): `AGENTKEY_VERIFY_ENABLED`, `AGENTKEY_BASE_URL`, `AGENTKEY_BINDINGS`
- Docs: `docs/developers/agentkey.md`

## Companion

AgentKey SDK installable from git (merged): https://github.com/Rosh2403/AgentKey/pull/15

```json
"@agentkey/sdk": "github:Rosh2403/AgentKey#main&path:packages/sdk"
```

## Ask

Please review/merge into `development`. Contract security model unchanged.
BODY
)"
```

### Alternate: clone handoff files

```bash
git clone --depth 1 -b cursor/countersign-bridge-handoff-15be https://github.com/Rosh2403/AgentKey.git /tmp/agentkey-handoff
cp /tmp/agentkey-handoff/handoff/countersign-agentkey-bridge.patch ./agentkey-bridge.patch
```

### Alternate: git bundle

```bash
gh api -H "Accept: application/vnd.github.raw" \
  "repos/Rosh2403/AgentKey/contents/handoff/countersign-agentkey-bridge.bundle?ref=cursor/countersign-bridge-handoff-15be" \
  > agentkey-bridge.bundle
git fetch agentkey-bridge.bundle feature/agentkey-bridge:feature/agentkey-bridge
git checkout feature/agentkey-bridge
```

## Env demo (after merge / local)

```bash
export AGENTKEY_VERIFY_ENABLED=true
export AGENTKEY_BASE_URL=http://127.0.0.1:8787
export AGENTKEY_BINDINGS='{"2066":"ak_…"}'
# POST /v1/payments with agentkey.proof — stop Agentkey API → 403 fail-closed
```
