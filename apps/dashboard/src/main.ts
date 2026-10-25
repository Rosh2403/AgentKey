import "./styles.css";
import type { AgentId, VerifyResult } from "@agentkey/protocol";
import {
  apiBaseUrl,
  checkHealth,
  issueAgent,
  requestChallenge,
  resolveAgent,
  verifyAgent,
} from "./api.js";
import {
  createOwnershipProof,
  generateKeyPair,
} from "./browser-keys.js";

type VerifyMode = "paste" | "challenge";

const app = document.querySelector("#app");
if (!app) {
  throw new Error("#app root missing");
}

app.innerHTML = `
  <div class="shell">
    <header class="hero">
      <div class="hero-atmosphere" aria-hidden="true"></div>
      <div class="hero-inner">
        <h1 class="brand">Agent<span>key</span></h1>
        <p class="hero-lead">Portable agent identity you can resolve and verify.</p>
        <p class="hero-sub">Look up a public handle, run a challenge or paste a proof, and get a typed status — fail closed.</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="#resolve">Resolve an agent</a>
          <a class="btn btn-ghost" href="#verify">Verify ownership</a>
        </div>
        <div class="api-chip" id="api-status" aria-live="polite">
          <span class="api-dot" id="api-dot"></span>
          <span id="api-label">Checking API…</span>
        </div>
      </div>
      <p class="scroll-hint">Issue · resolve · verify</p>
    </header>

    <section class="panel" id="resolve">
      <h2>Resolve</h2>
      <p class="panel-lead">Look up an agent by public handle or agent id. Public resolve hides the private subject.</p>
      <form id="resolve-form" class="field-grid">
        <div class="field">
          <label for="resolve-id">Public handle or agent id</label>
          <input id="resolve-id" class="mono" name="idOrHandle" autocomplete="off" placeholder="my-bot or ak_…" required />
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primary">Resolve</button>
        </div>
      </form>
      <div id="resolve-error" class="error-inline" hidden></div>
      <div id="resolve-result" class="result" hidden></div>
    </section>

    <section class="panel" id="verify">
      <h2>Verify</h2>
      <p class="panel-lead">Prove control of an agent id. Outcomes are typed: valid, invalid, unknown, revoked, or error. Failures never soft-allow.</p>
      <div class="verify-modes" role="group" aria-label="Proof input mode">
        <button type="button" class="mode-tab" data-mode="challenge" aria-pressed="true">Challenge &amp; sign</button>
        <button type="button" class="mode-tab" data-mode="paste" aria-pressed="false">Paste proof</button>
      </div>
      <form id="verify-form" class="field-grid">
        <div class="field">
          <label for="verify-agent">Agent id</label>
          <input id="verify-agent" class="mono" name="agentId" autocomplete="off" placeholder="ak_…" required />
        </div>
        <div id="challenge-fields" class="field-grid">
          <div class="field">
            <label for="verify-challenge">Challenge</label>
            <input id="verify-challenge" class="mono" name="challenge" autocomplete="off" />
          </div>
          <div class="field">
            <label for="verify-private">Subject private key (hex, local only)</label>
            <input id="verify-private" class="mono" name="privateKey" autocomplete="off" spellcheck="false" />
          </div>
          <p class="hint">Private keys stay in this browser tab. Nothing is logged to the API except the signed proof.</p>
        </div>
        <div id="paste-fields" class="field-grid" hidden>
          <div class="field">
            <label for="verify-proof">Ownership proof (JSON)</label>
            <textarea id="verify-proof" name="proof" spellcheck="false" placeholder='{"challenge":"…","signature":"…"}'></textarea>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" id="new-challenge">New challenge</button>
          <button type="submit" class="btn btn-primary">Run verify</button>
        </div>
      </form>
      <div id="verify-result" class="result" hidden></div>
    </section>

    <section class="panel" id="issue">
      <h2>Issue</h2>
      <p class="panel-lead">Register a new agent with the local root issuer. Dual IDs: public handle plus private subject.</p>
      <div class="toggle-row">
        <input type="checkbox" id="local-mode" />
        <label for="local-mode">Enable local non-production mode</label>
      </div>
      <div id="issue-panel" hidden>
        <div class="local-banner">
          Local mode only — ephemeral or env-configured issuer keys on your API. Do not use for production issuance.
        </div>
        <form id="issue-form" class="field-grid">
          <div class="field">
            <label for="issue-handle">Public handle</label>
            <input id="issue-handle" class="mono" name="publicHandle" autocomplete="off" placeholder="my-bot" required />
          </div>
          <div class="actions">
            <button type="submit" class="btn btn-primary">Generate keys &amp; register</button>
          </div>
        </form>
        <div id="issue-error" class="error-inline" hidden></div>
        <div id="issue-result" class="result" hidden></div>
      </div>
    </section>
  </div>
`;

let verifyMode: VerifyMode = "challenge";

const resolveForm = mustEl<HTMLFormElement>("#resolve-form");
const resolveError = mustEl<HTMLElement>("#resolve-error");
const resolveResult = mustEl<HTMLElement>("#resolve-result");
const verifyForm = mustEl<HTMLFormElement>("#verify-form");
const verifyResult = mustEl<HTMLElement>("#verify-result");
const challengeFields = mustEl<HTMLElement>("#challenge-fields");
const pasteFields = mustEl<HTMLElement>("#paste-fields");
const challengeInput = mustEl<HTMLInputElement>("#verify-challenge");
const privateInput = mustEl<HTMLInputElement>("#verify-private");
const proofInput = mustEl<HTMLTextAreaElement>("#verify-proof");
const agentInput = mustEl<HTMLInputElement>("#verify-agent");
const localMode = mustEl<HTMLInputElement>("#local-mode");
const issuePanel = mustEl<HTMLElement>("#issue-panel");
const issueForm = mustEl<HTMLFormElement>("#issue-form");
const issueError = mustEl<HTMLElement>("#issue-error");
const issueResult = mustEl<HTMLElement>("#issue-result");
const apiDot = mustEl<HTMLElement>("#api-dot");
const apiLabel = mustEl<HTMLElement>("#api-label");

/** Fresh one-time challenge from the API (each one works once, for 5 min). */
async function refreshChallenge(): Promise<void> {
  try {
    challengeInput.value = await requestChallenge("verify");
  } catch {
    challengeInput.value = "";
    challengeInput.placeholder = "API offline: start it to get a challenge";
  }
}

void refreshChallenge();

document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.mode as VerifyMode;
    verifyMode = mode;
    document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach((t) => {
      t.setAttribute("aria-pressed", String(t.dataset.mode === mode));
    });
    challengeFields.hidden = mode !== "challenge";
    pasteFields.hidden = mode !== "paste";
  });
});

mustEl<HTMLButtonElement>("#new-challenge").addEventListener("click", () => {
  void refreshChallenge();
});

localMode.addEventListener("change", () => {
  issuePanel.hidden = !localMode.checked;
});

resolveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    resolveError.hidden = true;
    resolveResult.hidden = true;
    const idOrHandle = new FormData(resolveForm).get("idOrHandle");
    if (typeof idOrHandle !== "string" || !idOrHandle.trim()) {
      showError(resolveError, "Enter a public handle or agent id.");
      return;
    }
    try {
      const agent = await resolveAgent(idOrHandle.trim());
      agentInput.value = agent.id;
      resolveResult.hidden = false;
      resolveResult.innerHTML = `
        <h3>Resolved agent</h3>
        <pre>${escapeHtml(formatAgent(agent))}</pre>
      `;
    } catch (err) {
      showError(
        resolveError,
        err instanceof Error ? err.message : "Resolve failed",
      );
    }
  })();
});

verifyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    verifyResult.hidden = true;
    const agentId = agentInput.value.trim();
    let proof = "";
    try {
      if (verifyMode === "paste") {
        proof = proofInput.value.trim();
      } else {
        proof = await createOwnershipProof({
          agentId,
          challenge: challengeInput.value.trim(),
          privateKey: privateInput.value.trim(),
        });
      }
    } catch (err) {
      renderVerifyResult(
        failClosedLocal(err instanceof Error ? err.message : "proof build failed"),
      );
      return;
    }
    const result = await verifyAgent({ agentId, proof });
    renderVerifyResult(result);
    // The challenge is used up once a proof over it passes.
    if (verifyMode === "challenge" && result.status === "valid") {
      void refreshChallenge();
    }
  })();
});

issueForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    issueError.hidden = true;
    issueResult.hidden = true;
    if (!localMode.checked) {
      showError(issueError, "Enable local non-production mode first.");
      return;
    }
    const handle = new FormData(issueForm).get("publicHandle");
    if (typeof handle !== "string" || !handle.trim()) {
      showError(issueError, "Public handle is required.");
      return;
    }
    try {
      const keys = await generateKeyPair();
      const agent = await issueAgent({
        publicHandle: handle.trim(),
        publicKey: keys.publicKey,
      });
      agentInput.value = agent.id;
      privateInput.value = keys.privateKey;
      issueResult.hidden = false;
      issueResult.innerHTML = `
        <h3>Issued (local)</h3>
        <pre>${escapeHtml(formatAgent(agent))}</pre>
        <div class="secret-box">
          <strong>Subject private key — shown once, never sent to resolve</strong>
          ${escapeHtml(keys.privateKey)}
        </div>
        <div class="secret-box">
          <strong>Private subject (authorized issue response)</strong>
          ${escapeHtml(agent.privateSubject ?? "(not returned)")}
        </div>
        <p class="hint">Agent id copied into Verify. Use Challenge &amp; sign with the private key above.</p>
      `;
    } catch (err) {
      showError(
        issueError,
        err instanceof Error ? err.message : "Issue failed",
      );
    }
  })();
});

function renderVerifyResult(result: VerifyResult): void {
  verifyResult.hidden = false;
  const status = result.status;
  const reason = result.reason ? `\nreason: ${result.reason}` : "";
  verifyResult.innerHTML = `
    <h3>Verify result</h3>
    <div class="status-badge status-${escapeAttr(status)}">${escapeHtml(status)}</div>
    <pre>${escapeHtml(`status: ${status}${reason}`)}</pre>
  `;
}

function failClosedLocal(reason: string): VerifyResult {
  return { status: "error", reason };
}

function formatAgent(agent: AgentId): string {
  const lines = [
    `id: ${agent.id}`,
    `publicHandle: ${agent.publicHandle}`,
    `publicKey: ${agent.publicKey}`,
    `issuerId: ${agent.issuerId}`,
    `status: ${agent.status}`,
    `createdAt: ${agent.createdAt}`,
  ];
  if (agent.issuerAttestation) {
    lines.push(`issuerAttestation: ${agent.issuerAttestation.slice(0, 24)}…`);
  }
  if (agent.anchorCommitment) {
    lines.push(`anchorCommitment: ${agent.anchorCommitment}`);
  }
  if (agent.privateSubject) {
    lines.push(`privateSubject: ${agent.privateSubject}`);
  } else {
    lines.push(`privateSubject: (hidden on public resolve)`);
  }
  return lines.join("\n");
}

function showError(el: HTMLElement, message: string): void {
  el.hidden = false;
  el.textContent = message;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function mustEl<T extends Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`Missing element ${selector}`);
  }
  return el as T;
}

void (async () => {
  const ok = await checkHealth();
  const base = apiBaseUrl() || "(vite proxy → local API)";
  if (ok) {
    apiDot.classList.add("ok");
    apiLabel.textContent = `API reachable · ${base}`;
  } else {
    apiDot.classList.add("down");
    apiLabel.textContent = `API unreachable · start pnpm dev:api · ${base}`;
  }
})();
