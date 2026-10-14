# Countersign Agentkey bridge harden — handoff

`cursor[bot]` got **403** pushing to `AfshalG/countersign` and `Rosh2403/countersign`.  
This folder is the apply-and-PR handoff for a collaborator with write access (Rosh / Afshal).

**No new AgentKey product PRs** — AgentKey is only optional file hosting for this patch.

## What changed (from `development` @ `b1c6b34`)

1. **Binding spoof (High)** — `resolveAgentkeyId`: `AGENTKEY_BINDINGS` is authoritative. Client `agentkey.id` that differs → mismatch deny. Explicit id only when no binding.
2. **Proof replay (Medium)** — proofs must use payment-bound challenge `countersign-pay-v1:{vault}:{invoiceHash}:{amount}:{payTo}:{deadline}:{nonce}:{exp}` with short TTL. Static `countersign-pay` rejected. Documented in `docs/developers/agentkey.md`.
3. **Gate clarity** — `/health` → `agentkey.integrated: true` + `agentkey.enabled`; startup **warn** when disabled. Docs: integrated ≠ enabled in prod.

Tests added: binding mismatch, explicit id ignored/mismatched when bound, missing proof, static challenge, wrong-invoice replay, expired TTL.

## Apply + open draft PR → `development`

```bash
git clone https://github.com/AfshalG/countersign.git
cd countersign
git fetch origin development
git checkout development
git pull origin development
git checkout -b cursor/agentkey-bridge-harden-8732

# Option A: patch from this Agent Store path (if you have the file locally)
git am /path/to/0001-fix-agentkey-bridge-bind-proofs-to-payments-and-honor-bindings.patch

# Option B: if hosted on AgentKey handoff branch (see below)
# gh api -H "Accept: application/vnd.github.raw" \
#   "repos/Rosh2403/AgentKey/contents/handoff/countersign-bridge-harden.patch?ref=cursor/countersign-bridge-harden-handoff-8732" \
#   > countersign-bridge-harden.patch
# git am countersign-bridge-harden.patch

pnpm install
pnpm exec vitest run packages/agentkey-bridge services/gateway/test/agentkey-gate.test.ts
# expect 32 passed

git push -u origin cursor/agentkey-bridge-harden-8732

gh pr create --repo AfshalG/countersign --base development --draft \
  --title 'fix(agentkey-bridge): bind proofs to payments and honor bindings' \
  --body "$(cat <<'BODY'
## Why

Security stress findings on the Countersign ↔ Agentkey bridge: binding spoof via client `agentkey.id`, replayable static proofs, and unclear “integrated vs enabled” for demos.

## What

- **Bindings authoritative** — `AGENTKEY_BINDINGS` wins; mismatched `agentkey.id` → 403
- **Payment-bound challenges** — `countersign-pay-v1:…` + TTL; static `countersign-pay` rejected
- **Health** — `agentkey.integrated` + `agentkey.enabled`; warn in logs when gate off
- Docs: `docs/developers/agentkey.md` (challenge format + integrated ≠ enabled)
- Tests for mismatch, missing proof, replay/expiry

## Ask

Draft into `development`. No secrets. Contract/vault model unchanged.
BODY
)"
```

## Files in this folder

| File | Role |
| --- | --- |
| `0001-fix-agentkey-bridge-bind-proofs-to-payments-and-honor-bindings.patch` | `git am` onto AfshalG `development` |
| `README.md` | This handoff |

## Challenge format (quick)

```
countersign-pay-v1:{vault}:{invoiceHash}:{amount}:{payTo}:{deadline}:{nonce}:{exp}
```

Helper: `buildPaymentChallenge` from `@countersign/agentkey-bridge`.
