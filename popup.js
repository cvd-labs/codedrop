// src/lib/constants.ts
var ATTEMPT_TTL_MS = 3 * 60 * 1e3;
var FRESHNESS_MS = 10 * 60 * 1e3;
var CLOCK_SKEW_MS = 2 * 60 * 1e3;
var MAX_TOKEN_TTL_MS = 60 * 60 * 1e3;
var GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// src/lib/copy.ts
var attemptMinutes = Math.round(ATTEMPT_TTL_MS / 6e4);
var freshMinutes = Math.round(FRESHNESS_MS / 6e4);
var REASONS = {
  needs_setup: {
    title: "Choose a mailbox first",
    body: "CodeDrop waits for a source in this popup. A signed-in Gmail session does not choose one."
  },
  no_tab: {
    title: "No login tab",
    body: "Open the https login page, then open CodeDrop from that window."
  },
  ambiguous_target: {
    title: "More than one login tab",
    body: "Focus the single supported tab you want, then open CodeDrop from that window."
  },
  not_https: {
    title: "This tab is not https",
    body: "CodeDrop only starts an attempt on an https page."
  },
  unsupported_origin: {
    title: "This site is not supported",
    body: "The tab's origin is not on the allowlist, so no mailbox was read."
  },
  origin_service_mismatch: {
    title: "Service and tab disagree",
    body: "The service for this attempt has to be the allowlisted service for this exact origin."
  },
  source_mismatch: {
    title: "Mailbox choice does not match setup",
    body: "Start again from the source you selected. Fixture data was not swapped in."
  },
  invalid_account: {
    title: "Account needs a plain email",
    body: "Type the address the message will name, such as ada@example.com. CodeDrop does not fold dots or plus-tags."
  },
  invalid_scenario: {
    title: "Unknown fixture scenario",
    body: "Pick one of the built-in fixture scenarios."
  },
  invalid_mailbox: {
    title: "Unknown mailbox",
    body: "Choose the fixture mailbox or a Gmail account 0, 1, or 2."
  },
  invalid_client_id: {
    title: "That client id is not usable",
    body: "Paste a client id that ends in .apps.googleusercontent.com, from a Cloud project you control."
  },
  invalid_token: {
    title: "The token was not stored",
    body: "CodeDrop only keeps a short-lived access token in memory for this browser session."
  },
  no_attempt: {
    title: "No pending attempt",
    body: "Start from the login tab. CodeDrop does not keep a code after the attempt ends."
  },
  already_filled: {
    title: "Already filled",
    body: "Start a new attempt if you need another read."
  },
  not_matched: {
    title: "There is no code to fill",
    body: "A refusal stays a refusal. Nothing was typed into the page."
  },
  expired_attempt: {
    title: "That attempt expired",
    body: `Pending attempts last ${attemptMinutes} minutes. The code was deleted.`
  },
  tab_changed: {
    title: "The login tab changed site",
    body: "The code for the old site was deleted. Nothing was filled."
  },
  tab_not_active: {
    title: "Switch back to the login tab",
    body: "Fill only runs when that login tab is the active tab in this window."
  },
  no_messages: {
    title: "No messages in this read",
    body: "The mailbox read came back empty. Fixture codes were not used in its place."
  },
  sender_unverified: {
    title: "No accepted sender",
    body: "Nothing in this read came from a sender address on the allowlist for this service."
  },
  account_mismatch: {
    title: "Sender matched, account did not",
    body: "A message from the service sender did not name this account. The sender alone is not enough."
  },
  unknown_age: {
    title: "No usable time on the message",
    body: "CodeDrop will not treat a message as fresh when the time is missing."
  },
  future_dated: {
    title: "The message time is in the future",
    body: "Nothing was filled."
  },
  stale: {
    title: "The message is too old",
    body: `Matching mail has to be under ${freshMinutes} minutes old. Nothing was filled.`
  },
  no_code: {
    title: "No verification code in the visible text",
    body: "The sender and account matched, but a single 6-digit code was not visible."
  },
  ambiguous_code: {
    title: "That message has more than one code",
    body: "CodeDrop does not guess. Nothing was filled."
  },
  ambiguous_messages: {
    title: "More than one message matched",
    body: "CodeDrop does not guess. Nothing was filled."
  },
  gmail_opt_in_missing: {
    title: "Gmail tab reading is off",
    body: "Choose Gmail tab in setup if you want that read. Fixture codes were not used."
  },
  gmail_permission_missing: {
    title: "Chrome has not allowed the Gmail tab",
    body: "Allow mail.google.com from the Gmail tab setup. Being signed in is a separate fact."
  },
  gmail_tab_missing: {
    title: "No Gmail tab for that account",
    body: "Open Gmail yourself on the matching /mail/u/0, /u/1, or /u/2 tab. CodeDrop will not open it."
  },
  ambiguous_gmail_tab: {
    title: "More than one Gmail tab matches",
    body: "Close the extra tab for that account number. CodeDrop will not pick one."
  },
  gmail_tab_asleep: {
    title: "That Gmail tab is asleep",
    body: "Click the tab yourself so Gmail is on screen, then try again. CodeDrop will not reload it."
  },
  gmail_tab_unreadable: {
    title: "The Gmail tab could not be read",
    body: "The page may still be loading, or the markup may have changed. Nothing was filled."
  },
  gmail_inbox_too_large: {
    title: "Too many inbox rows to be sure",
    body: "Open the one email, then try again. CodeDrop reads an open message on its own and will not open it for you."
  },
  nothing_visible: {
    title: "Nothing readable on the Gmail tab",
    body: "CodeDrop sees an open message, or inbox rows when nothing is open. It does not click or search. Snippets are often too short to include the account and the code."
  },
  signed_out: {
    title: "That Gmail tab looks signed out",
    body: "Sign in yourself. CodeDrop will not type Google credentials."
  },
  not_gmail_document: {
    title: "That tab is not Gmail",
    body: "The read only runs on https://mail.google.com."
  },
  oauth_not_configured: {
    title: "No OAuth client is saved",
    body: "This build does not include a Google client. Add one from a Cloud project you control, or use another source."
  },
  oauth_not_connected: {
    title: "Gmail API is not connected",
    body: "Connect with your own client when you want this source. Fixture codes were not used."
  },
  gmail_api_permission_missing: {
    title: "Gmail API permission is missing",
    body: "Allow the Gmail API host from the connect button. Fixture codes were not used."
  },
  gmail_api_rejected: {
    title: "Google rejected the Gmail API request",
    body: "The token may be expired or the Cloud project may not allow this scope. Fixture codes were not used."
  },
  gmail_api_failed: {
    title: "The Gmail API read failed",
    body: "CodeDrop stopped. Fixture codes were not used."
  },
  no_field: {
    title: "No verification field on this tab",
    body: "Nothing was typed and nothing was submitted. The code is still in this popup until you dismiss it or it expires."
  },
  ambiguous_field: {
    title: "More than one code field",
    body: "CodeDrop did not type into the page and did not submit."
  },
  fill_missing: {
    title: "The fill script did not start",
    body: "Nothing was typed. Try Fill again from this popup."
  },
  internal_error: {
    title: "CodeDrop hit an internal error",
    body: "Nothing was filled. The code was not written to the page."
  },
  unexpected_fields: {
    title: "That request was refused",
    body: "The popup only sends a fixed set of fields. Origins and codes do not come from the page."
  },
  untrusted_sender: {
    title: "That caller cannot ask for a code",
    body: "Only the CodeDrop popup can start a read or a fill."
  }
};
function explain(reason) {
  return REASONS[reason] ?? {
    title: "Nothing was filled",
    body: "CodeDrop stopped without a code."
  };
}
function filledNote(sourceLabel) {
  if (sourceLabel === "fixture") {
    return {
      title: "Filled a fixture code",
      body: "The field now has the fake code. CodeDrop did not press submit. The site can still submit itself when a field changes."
    };
  }
  return {
    title: "Filled the code",
    body: "CodeDrop did not press submit. The site can still submit itself when a field changes."
  };
}
var PRIVACY_POINTS = [
  "Matching runs on this computer. CodeDrop has no server and does not send telemetry.",
  "A mailbox is read only after you choose that source in this popup. A Gmail session in Chrome does not turn that on.",
  "Gmail tab mode reads text already rendered on an open mail.google.com tab. It does not open messages, click, search, or call Gmail's private APIs.",
  "Gmail API mode talks only to Google, and only after you connect an OAuth client from a Cloud project you control. This build does not include one.",
  "Fixture results are labeled fixture data. If a live read fails, CodeDrop reports the failure and does not substitute a fake code.",
  `A matched code stays in Chrome's memory-only session storage for up to ${attemptMinutes} minutes, then it is deleted. It is not written to disk storage and it is not shown on the website until you press Fill.`,
  "Fill writes the verification field and fires input and change. It does not press submit. The website can still submit itself when the field changes.",
  "CodeDrop is not phishing-proof. It checks an allowlist, the account, and freshness, then refuses weak or multiple matches. It does not stop malware, another extension, or a mistake in the account you type."
];

// src/lib/email.ts
var EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (email.includes("..") || email.includes("*")) return null;
  if (!EMAIL.test(email)) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain || domain.startsWith(".") || domain.endsWith(".")) return null;
  if (domain.split(".").some((label) => label.length === 0 || label.startsWith("-") || label.endsWith("-"))) {
    return null;
  }
  return email;
}

// src/lib/ids.ts
function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/lib/oauth.ts
var CLIENT_ID = /^[0-9]{6,30}-[a-z0-9_-]{6,80}\.apps\.googleusercontent\.com$/i;
function isPlausibleClientId(value) {
  const trimmed = value.trim();
  return trimmed.length <= 200 && CLIENT_ID.test(trimmed);
}
function isAccessToken(value) {
  return typeof value === "string" && value.length >= 20 && value.length <= 4096 && /^[A-Za-z0-9._~+/-]+=*$/.test(value);
}
async function createPkcePair() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64Url(bytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}
function buildAuthUrl(input) {
  if (!isPlausibleClientId(input.clientId)) throw new Error("invalid_client_id");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("access_type", "online");
  return url.toString();
}
function buildTokenRequestBody(input) {
  const body = new URLSearchParams();
  body.set("client_id", input.clientId.trim());
  body.set("redirect_uri", input.redirectUri);
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("code_verifier", input.verifier);
  return body.toString();
}
function readAuthRedirect(redirectUrl, expectedState) {
  let url;
  try {
    url = new URL(redirectUrl);
  } catch {
    return { ok: false, reason: "oauth_no_code" };
  }
  if (url.searchParams.get("state") !== expectedState || !expectedState) {
    return { ok: false, reason: "oauth_state_mismatch" };
  }
  if (url.searchParams.get("error")) return { ok: false, reason: "oauth_denied" };
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return { ok: false, reason: "oauth_no_code" };
  return { ok: true, code };
}
function readTokenResponse(body, now) {
  if (!body || typeof body !== "object") return null;
  const accessToken = body.access_token;
  const expiresIn = body.expires_in;
  if (!isAccessToken(accessToken) || typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) return null;
  const seconds = Math.min(expiresIn, MAX_TOKEN_TTL_MS / 1e3);
  if (seconds < 30) return null;
  return { accessToken, expiresAt: now + seconds * 1e3 };
}
function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// src/popup/popup.ts
var view = null;
var panel = "auto";
var draftAccount = "";
var draftClient = "";
var gmailIndex = 0;
var busy = false;
var localNote = null;
var SCENARIOS = [
  { id: "single", label: "One fresh code" },
  { id: "ambiguous", label: "Two fresh codes" },
  { id: "stale", label: "Stale code only" },
  { id: "wrong_account", label: "Account not in the message" },
  { id: "lookalike", label: "Lookalike sender" }
];
function boot() {
  void refresh();
  window.setInterval(tick, 1e3);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
function tick() {
  const pending = view?.pending;
  if (!pending || pending.kind !== "matched") return;
  const label = document.querySelector("[data-testid='countdown']");
  const left = pending.expiresAt - Date.now();
  if (label) label.textContent = left > 0 ? `Expires in ${formatLeft(left)}` : "Expired";
  if (left <= 0) {
    view = view ? { ...view, pending: null } : view;
    render();
    void refresh();
  }
}
async function refresh() {
  const response = await send({ type: "GET_STATE" });
  if (response?.view) apply(response.view, response.ok ? null : response.view.note);
  else if (!view) {
    localNote = explain(response && "reason" in response ? response.reason : "internal_error");
    render();
  }
}
function apply(next, note) {
  view = next;
  if (!draftClient) draftClient = next.oauthClientId;
  localNote = note;
  render();
}
async function send(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    localNote = explain("internal_error");
    render();
    return null;
  }
}
async function allowGmailDom() {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: ["https://mail.google.com/*"] });
  } catch {
    granted = false;
  }
  if (!granted) {
    const response2 = await send({ type: "GET_STATE" });
    granted = Boolean(response2?.view?.gmailDomPermission);
    if (response2?.view) view = response2.view;
  }
  if (!granted) {
    localNote = {
      title: "Gmail tab access was not granted",
      body: "CodeDrop did not read a mailbox."
    };
    render();
    return;
  }
  const response = await send({ type: "CHOOSE_SOURCE", source: "gmail_dom" });
  panel = "auto";
  if (response?.view) apply(response.view, null);
}
async function connectApi() {
  const clientId = draftClient.trim();
  if (!isPlausibleClientId(clientId)) {
    localNote = explain("invalid_client_id");
    render();
    return;
  }
  let granted = false;
  try {
    granted = await chrome.permissions.request({
      permissions: ["identity"],
      origins: ["https://gmail.googleapis.com/*", "https://oauth2.googleapis.com/*"]
    });
  } catch {
    granted = false;
  }
  await send({ type: "SET_OAUTH_CLIENT_ID", clientId });
  if (!granted) {
    localNote = {
      title: "Google permission was not granted",
      body: "CodeDrop did not open a mailbox and did not use fixture codes."
    };
    render();
    return;
  }
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  try {
    const pair = await createPkcePair();
    const state = randomId();
    const url = buildAuthUrl({ clientId, redirectUri, challenge: pair.challenge, state });
    const returned = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
    if (!returned) {
      localNote = { title: "Google sign-in was closed", body: "No token was stored." };
      render();
      return;
    }
    const parsed = readAuthRedirect(returned, state);
    if (!parsed.ok) {
      localNote = { title: "Google did not return a code", body: "No token was stored. Fixture codes were not used." };
      render();
      return;
    }
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildTokenRequestBody({ clientId, redirectUri, code: parsed.code, verifier: pair.verifier }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    if (!tokenResponse.ok) {
      localNote = explain("gmail_api_rejected");
      render();
      return;
    }
    const token = readTokenResponse(await tokenResponse.json(), Date.now());
    if (!token) {
      localNote = explain("invalid_token");
      render();
      return;
    }
    const response = await send({
      type: "STORE_OAUTH_TOKEN",
      accessToken: token.accessToken,
      expiresAt: token.expiresAt
    });
    if (response?.view) apply(response.view, { title: "Gmail API connected", body: "The access token stays in memory for this browser session." });
  } catch {
    localNote = {
      title: "The Google connection did not finish",
      body: "This path was not verified against a live Cloud project in development. No fixture code was used."
    };
    render();
  }
}
async function onLook() {
  if (!view || view.tab.kind !== "ready" || !view.source || busy) return;
  const account = normalizeEmail(draftAccount);
  if (!account) return;
  busy = true;
  localNote = { title: "Reading", body: "CodeDrop is checking the mailbox you selected." };
  render();
  const mailbox = view.source === "demo" ? { provider: "demo", scenario: view.demoScenario } : {
    provider: "gmail",
    index: gmailIndex,
    mode: view.source === "gmail_dom" ? "dom" : "api"
  };
  const response = await send({
    type: "START_ATTEMPT",
    accountEmail: account,
    serviceId: view.tab.serviceId,
    mailbox
  });
  busy = false;
  if (response?.view) apply(response.view, response.ok ? null : response.view.note);
  else render();
}
async function onFill() {
  if (busy) return;
  busy = true;
  render();
  const response = await send({ type: "FILL" });
  busy = false;
  if (response?.view) {
    const note = response.view.note ?? (response.view.pending?.kind === "filled" ? filledNote(response.view.pending.sourceLabel) : null);
    apply(response.view, note);
  } else render();
}
function render() {
  const app = document.querySelector("#app");
  if (!app) return;
  const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.id : "";
  app.replaceChildren(shell());
  const account = document.querySelector("#account");
  if (account) account.value = draftAccount;
  const client = document.querySelector("#client-id");
  if (client && document.activeElement !== client) client.value = draftClient;
  if (focusedId === "account") account?.focus();
  if (focusedId === "client-id") client?.focus();
}
function shell() {
  const root = el("div", { class: "app" });
  root.append(header());
  if (!view) {
    root.append(el("p", { class: "idle" }, localNote?.title ?? "Opening CodeDrop\u2026"));
    if (localNote) root.append(el("p", { class: "idle" }, localNote.body));
    return root;
  }
  if (panel === "privacy") root.append(privacy());
  else if (panel === "settings") root.append(settings());
  else if (panel === "gmail") root.append(gmailExplain());
  else if (panel === "api") root.append(apiPanel());
  else if (!view.source) root.append(setup());
  else root.append(main());
  return root;
}
function header() {
  return el(
    "div",
    {},
    el(
      "div",
      { class: "top" },
      el("div", { class: "mark", ariaHidden: "true" }, el("i", {}), el("b", {})),
      el("div", { class: "word" }, el("strong", {}, "KAMAL"), el("span", {}, "A code, if it matches")),
      button("Privacy", "icon-btn", () => {
        panel = "privacy";
        render();
      }),
      button("Setup", "icon-btn", () => {
        panel = view?.source ? "settings" : "auto";
        if (!view?.source) panel = "auto";
        render();
      }, "settings")
    ),
    el("hr", { class: "rule" })
  );
}
function setup() {
  return el(
    "div",
    { class: "stack", testid: "setup" },
    el(
      "p",
      { class: "idle" },
      "CodeDrop suggests one verification code and fills it when you ask. Pick a mailbox here. A Gmail session does not count as that choice."
    ),
    tabLine(),
    choice("Use fixture mailbox", "Fake messages built into CodeDrop. Nothing is read from Gmail.", () => void choose("demo"), "choose-demo"),
    choice("Use the Gmail tab", "Read text already visible on an open Gmail tab. Chrome will ask separately. CodeDrop will not open your mail.", () => {
      panel = "gmail";
      render();
    }, "choose-gmail-dom"),
    choice("Use the Gmail API", "Requires an OAuth client you create. This prototype does not include one.", () => {
      panel = "api";
      render();
    }, "choose-gmail-api"),
    serviceList()
  );
}
function gmailExplain() {
  return el(
    "div",
    { class: "stack", testid: "gmail-explain" },
    el("p", { class: "kicker" }, "Gmail tab"),
    el(
      "p",
      { class: "idle" },
      "CodeDrop reads an open message, or inbox rows when nothing is open. It does not click, search, or open mail. Snippets often omit the code, so opening the email yourself is the reliable path. Allowing mail.google.com is separate from being signed in."
    ),
    button("Allow Gmail tab access", "primary", () => void allowGmailDom(), "allow-gmail"),
    button("Back", "secondary", () => {
      panel = "auto";
      render();
    }),
    noteCard()
  );
}
function apiPanel() {
  const redirect = view?.redirectUri ?? `https://${chrome.runtime.id}.chromiumapp.org/`;
  return el(
    "div",
    { class: "stack", testid: "api-panel" },
    el("p", { class: "kicker" }, "Gmail API"),
    el(
      "p",
      { class: "idle" },
      "Create an OAuth client in a Google Cloud project you control. Add yourself as a test user. Scope is gmail.readonly, which Google treats as restricted. This build ships no client id and this path was not signed in during development."
    ),
    el("p", { class: "fine" }, "Authorized redirect URI"),
    el("p", { class: "meta", testid: "redirect-uri" }, redirect),
    el(
      "label",
      { class: "field" },
      el("span", {}, "OAuth client id"),
      (() => {
        const input = el("input", {
          id: "client-id",
          testid: "oauth-client",
          placeholder: "000000000000-xxxx.apps.googleusercontent.com",
          autocomplete: "off",
          spellcheck: "false"
        });
        input.addEventListener("input", () => {
          draftClient = input.value;
        });
        return input;
      })()
    ),
    button(
      "Save client id",
      "secondary",
      () => {
        void send({ type: "SET_OAUTH_CLIENT_ID", clientId: draftClient.trim() }).then((response) => {
          if (response?.view) apply(response.view, response.ok ? null : response.view.note);
        });
      },
      "save-client"
    ),
    button("Connect Gmail API", "primary", () => void connectApi(), "connect-api"),
    button("Use this source", "secondary", () => void choose("gmail_api"), "choose-gmail-api-confirm"),
    button("Back", "secondary", () => {
      panel = view?.source ? "settings" : "auto";
      render();
    }),
    noteCard()
  );
}
function main() {
  if (!view?.source) return setup();
  const blocks = [sourceBanner(), tabLine(), accountField()];
  if (view.source === "demo") blocks.push(scenarioField());
  if (view.source !== "demo") blocks.push(indexField());
  blocks.push(actionRow(), resultCard());
  return el("div", { class: "stack", testid: "main" }, ...blocks);
}
function settings() {
  return el(
    "div",
    { class: "stack", testid: "settings" },
    el("p", { class: "kicker" }, "Mailbox"),
    choice("Fixture mailbox", "Fake messages. A failed live read never uses these.", () => void choose("demo"), "choose-demo"),
    choice("Gmail tab", "Visible text on an open tab, after a separate permission.", () => {
      panel = "gmail";
      render();
    }, "choose-gmail-dom"),
    choice("Gmail API", "Your own OAuth client. Not included in this build.", () => {
      panel = "api";
      render();
    }, "choose-gmail-api"),
    button("Turn off Gmail tab access", "secondary", () => {
      void send({ type: "REVOKE_GMAIL_DOM" }).then((response) => {
        panel = "auto";
        if (response?.view) apply(response.view, null);
      });
    }, "revoke-gmail"),
    button("Disconnect Gmail API", "secondary", () => {
      void send({ type: "DISCONNECT_OAUTH" }).then((response) => {
        if (response?.view) apply(response.view, null);
      });
    }, "disconnect-api"),
    serviceList(),
    button("Back", "secondary", () => {
      panel = "auto";
      render();
    })
  );
}
function privacy() {
  const block = el("div", { class: "stack privacy", testid: "privacy" });
  for (const point of PRIVACY_POINTS) block.append(el("p", {}, point));
  block.append(
    button("Back", "secondary", () => {
      panel = "auto";
      render();
    })
  );
  return block;
}
function sourceBanner() {
  if (!view?.source) return null;
  if (view.source === "demo") {
    return el(
      "div",
      { class: "banner fixture", testid: "banner" },
      "Fixture mailbox. These messages are fake and stay inside the extension. If a live read fails, CodeDrop does not switch to this."
    );
  }
  if (view.source === "gmail_dom") {
    return el(
      "div",
      { class: "banner live", testid: "banner" },
      "Gmail tab. Visible text only. CodeDrop does not open mail."
    );
  }
  return el(
    "div",
    { class: "banner live", testid: "banner" },
    view.oauthConnected ? "Gmail API. Your OAuth client, this session only." : "Gmail API. Not connected. Fixture codes will not be used."
  );
}
function tabLine() {
  const tab = view?.tab;
  if (!tab || tab.kind === "none") {
    return el("div", {}, el("p", { class: "kicker" }, "This tab"), el("p", { class: "origin", testid: "tab-origin" }, "No page tab yet"));
  }
  if (tab.kind === "ambiguous") {
    return el("div", {}, el("p", { class: "kicker" }, "This tab"), el("p", { class: "origin" }, "More than one supported login tab is open"));
  }
  if (tab.kind === "ready") {
    return el(
      "div",
      {},
      el("p", { class: "kicker" }, "This tab"),
      el("p", { class: "origin", testid: "tab-origin" }, tab.origin),
      el("p", { class: "service", testid: "service-name" }, tab.serviceName)
    );
  }
  const label = tab.kind === "not_https" ? "Not an https page" : "Not on the allowlist";
  return el(
    "div",
    {},
    el("p", { class: "kicker" }, "This tab"),
    el("p", { class: "origin", testid: "tab-origin" }, tab.origin),
    el("p", { class: "service" }, label)
  );
}
function accountField() {
  const input = el("input", {
    id: "account",
    testid: "account",
    type: "email",
    placeholder: "ada@example.com",
    autocomplete: "off",
    spellcheck: "false"
  });
  input.addEventListener("input", () => {
    draftAccount = input.value;
    syncLook();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void onLook();
    }
  });
  return el("label", { class: "field" }, el("span", {}, "Account the message should name"), input);
}
function scenarioField() {
  const select = el("select", { id: "scenario", testid: "scenario" });
  for (const scenario of SCENARIOS) {
    const option = el("option", { value: scenario.id }, scenario.label);
    option.selected = view?.demoScenario === scenario.id;
    select.append(option);
  }
  select.addEventListener("change", () => {
    const scenario = select.value;
    void send({ type: "SET_DEMO_SCENARIO", scenario }).then((response) => {
      if (response?.view) apply(response.view, null);
    });
  });
  return el("label", { class: "field" }, el("span", {}, "Fixture scenario"), select);
}
function indexField() {
  const row = el("div", { class: "index", testid: "mailbox-index" });
  for (const index of [0, 1, 2]) {
    const item = button(String(index), "", () => {
      gmailIndex = index;
      render();
    });
    item.setAttribute("aria-pressed", index === gmailIndex ? "true" : "false");
    row.append(item);
  }
  return el("div", {}, el("p", { class: "kicker" }, "Gmail account in the URL"), row, el("p", { class: "fine" }, "Use the number from /mail/u/0, /u/1, or /u/2."));
}
function actionRow() {
  const look = button(busy ? "Working\u2026" : "Look for a code", "primary", () => void onLook(), "look");
  look.disabled = !canLook();
  const again = view?.pending && view.pending.kind !== "filled" ? button("Check again", "secondary", () => {
    void send({ type: "CHECK_AGAIN" }).then((response) => {
      if (response?.view) apply(response.view, response.ok ? null : response.view.note);
    });
  }, "check-again") : null;
  return el("div", { class: "stack" }, look, again);
}
function resultCard() {
  const region = el("div", { testid: "result", role: "status", ariaLive: "polite" });
  const pending = view?.pending;
  if (pending?.kind === "matched" && Date.now() < pending.expiresAt) {
    region.append(matchCard(pending));
  } else if (pending?.kind === "filled") {
    region.append(copyCard(filledNote(pending.sourceLabel), pending.sourceLabel === "fixture" ? "fixture-flag" : "live-flag"));
  } else if (localNote || view?.note) {
    region.append(copyCard(localNote ?? view?.note ?? explain("internal_error")));
  } else if (pending?.kind === "failed") {
    region.append(copyCard({ title: pending.title, body: pending.body }));
  } else if (view?.notice === "expired") {
    region.append(copyCard(explain("expired_attempt")));
  } else {
    region.append(el("p", { class: "idle" }, "No attempt yet. CodeDrop does not read mail until you press the button."));
  }
  return region;
}
function matchCard(pending) {
  const fixture = pending.sourceLabel === "fixture";
  const card = el(
    "div",
    { class: "card" },
    el("p", { class: "kicker", testid: fixture ? "fixture-flag" : "live-flag" }, fixture ? "Fixture code" : pending.sourceLabel === "gmail_dom" ? "Gmail tab" : "Gmail API"),
    el("p", { class: "code", testid: "code" }, pending.code),
    el("p", { class: "meta" }, `${pending.serviceName} \xB7 ${pending.fromEmail}`),
    el("p", { class: "meta" }, `For ${pending.accountEmail} \xB7 ${pending.ageSeconds}s old`),
    el("p", { class: "meta", testid: "countdown" }, `Expires in ${formatLeft(pending.expiresAt - Date.now())}`),
    el(
      "p",
      { class: "warn" },
      fixture ? "This code is fake fixture data. It will not sign you in. CodeDrop does not press submit. The site can still submit itself when the field changes." : "CodeDrop does not press submit. The site can still submit itself when the field changes."
    )
  );
  const fill = button("Fill code", "primary", () => void onFill(), "fill");
  fill.disabled = busy;
  const dismiss = button("Forget this code", "secondary", () => {
    void send({ type: "DISMISS" }).then((response) => {
      if (response?.view) apply(response.view, null);
    });
  }, "dismiss");
  card.append(el("div", { class: "row" }, fill, dismiss));
  if (localNote && view?.note) card.append(el("p", { class: "warn" }, view.note.body));
  else if (view?.note && view.pending?.kind === "matched") card.append(el("p", { class: "warn" }, view.note.body));
  return card;
}
function copyCard(copy, testid) {
  return el(
    "div",
    { class: "note", testid },
    el("p", { class: "error-title", testid: "error-title" }, copy.title),
    el("p", {}, copy.body)
  );
}
function noteCard() {
  const copy = localNote ?? view?.note;
  return copy ? copyCard(copy) : null;
}
function serviceList() {
  const list = el("ul", { class: "sites" });
  for (const service of view?.supported ?? []) {
    list.append(el("li", {}, service.name, el("span", {}, service.origins.join(" "))));
  }
  return el("div", {}, el("p", { class: "kicker" }, "Supported sites"), list);
}
function choice(title, body, onClick, testid) {
  const node = el("button", { class: "choice", type: "button", testid }, el("div", { class: "choice-title" }, title), el("small", {}, body));
  node.addEventListener("click", onClick);
  return node;
}
function canLook() {
  if (!view || busy || view.tab.kind !== "ready" || !view.source) return false;
  if (!normalizeEmail(draftAccount)) return false;
  if (view.source === "gmail_dom" && (!view.gmailDomOptIn || !view.gmailDomPermission)) return false;
  if (view.source === "gmail_api" && (!view.oauthConfigured || !view.oauthConnected)) return false;
  return true;
}
function syncLook() {
  const look = document.querySelector("[data-testid='look']");
  if (look) look.disabled = !canLook();
}
async function choose(source) {
  const response = await send({ type: "CHOOSE_SOURCE", source });
  panel = "auto";
  if (response?.view) apply(response.view, null);
}
function formatLeft(ms) {
  const total = Math.max(0, Math.ceil(ms / 1e3));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
function button(label, className, onClick, testid) {
  const node = el("button", { class: className, type: "button", testid }, label);
  node.addEventListener("click", onClick);
  return node;
}
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.testid) node.dataset.testid = props.testid;
  if (props.type) node.setAttribute("type", props.type);
  if (props.placeholder) node.setAttribute("placeholder", props.placeholder);
  if (props.autocomplete) node.setAttribute("autocomplete", props.autocomplete);
  if (props.spellcheck) node.setAttribute("spellcheck", props.spellcheck);
  if (props.role) node.setAttribute("role", props.role);
  if (props.ariaLive) node.setAttribute("aria-live", props.ariaLive);
  if (props.ariaHidden) node.setAttribute("aria-hidden", props.ariaHidden);
  if (props.value) node.setAttribute("value", props.value);
  for (const child of children) {
    if (child === null || child === void 0 || child === false) continue;
    node.append(child);
  }
  return node;
}
