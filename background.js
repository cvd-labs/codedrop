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
function mentionsEmail(text, email) {
  const want = normalizeEmail(email);
  if (!want) return false;
  const escaped = want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^A-Za-z0-9._%+-])${escaped}(?![A-Za-z0-9_%+-])(?!\\.[A-Za-z0-9])`, "i");
  return re.test(text);
}
function emailsInHeader(value) {
  const bracket = [...value.matchAll(/<([^<>\s]+)>/g)].map((match) => normalizeEmail(match[1] ?? null)).filter((email) => email !== null);
  if (bracket.length > 0) return unique(bracket);
  const single = normalizeEmail(value);
  return single ? [single] : [];
}
function unique(emails) {
  return [...new Set(emails)];
}

// src/lib/plain.ts
function isPlain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function cleanText(value, max) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max);
}

// src/lib/gmail-api.ts
function buildGmailListQuery(service) {
  const senders = [...new Set(service.senderEmails)];
  if (senders.length === 0) throw new Error("service has no senders");
  for (const sender of senders) {
    if (normalizeEmail(sender) !== sender || /[\s()"']/.test(sender)) {
      throw new Error("allowlist sender is not query-safe");
    }
  }
  const clause = senders.map((sender) => `from:${sender}`).join(" OR ");
  return `newer_than:1d (${clause})`;
}
function gmailApiMessageToMail(raw) {
  if (!raw || typeof raw !== "object") return null;
  const record = raw;
  if (typeof record.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(record.id)) return null;
  const receivedAt = typeof record.internalDate === "string" && /^[0-9]{13}$/.test(record.internalDate) ? Number(record.internalDate) : null;
  const payload = record.payload;
  if (!payload || typeof payload !== "object") return null;
  const headers = readHeaders(payload.headers);
  const fromList = emailsInHeader(headers.get("from") ?? "");
  const fromEmail = fromList.length === 1 ? fromList[0] : null;
  const toEmails = emailsInHeader(headers.get("to") ?? "").slice(0, 10);
  const subject = cleanText(headers.get("subject") ?? "", 300);
  const bodyText = cleanText(readBody(payload), 2e4);
  if (!subject && !bodyText) return null;
  return {
    id: record.id,
    fromEmail,
    fromDisplay: "",
    toEmails,
    subject,
    bodyText,
    receivedAt: receivedAt !== null && Number.isFinite(receivedAt) ? receivedAt : null,
    sourceLabel: "gmail_api"
  };
}
function readHeaders(value) {
  const headers = /* @__PURE__ */ new Map();
  if (!Array.isArray(value)) return headers;
  for (const header of value.slice(0, 40)) {
    if (!header || typeof header !== "object") continue;
    const name = header.name;
    const headerValue = header.value;
    if (typeof name !== "string" || typeof headerValue !== "string") continue;
    headers.set(name.toLowerCase(), headerValue.slice(0, 2e3));
  }
  return headers;
}
function readBody(payload) {
  const collected = { plain: [], html: [], count: 0 };
  walk(payload, 0, collected);
  if (collected.plain.length > 0) return collected.plain.join("\n");
  if (collected.html.length > 0) return htmlToText(collected.html.join("\n"));
  return "";
}
function walk(part, depth, collected) {
  if (!part || typeof part !== "object" || depth > 8 || collected.count > 30) return;
  collected.count += 1;
  const record = part;
  const data = record.body && typeof record.body.data === "string" ? record.body.data : "";
  if (record.mimeType === "text/plain" && data) collected.plain.push(decodeBase64Url(data).slice(0, 1e5));
  else if (record.mimeType === "text/html" && data) collected.html.push(decodeBase64Url(data).slice(0, 1e5));
  if (Array.isArray(record.parts)) {
    for (const child of record.parts) walk(child, depth + 1, collected);
  }
}
function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}
function htmlToText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#(\d+);/g, (_, digits) => {
    const code = Number(digits);
    return code > 0 && code < 1114112 ? String.fromCodePoint(code) : " ";
  }).replace(/\s+/g, " ").trim();
}

// src/lib/services.ts
var SERVICES = [
  {
    id: "github",
    name: "GitHub",
    origins: ["https://github.com", "https://www.github.com"],
    senderEmails: ["noreply@github.com"]
  },
  {
    id: "npm",
    name: "npm",
    origins: ["https://www.npmjs.com", "https://npmjs.com"],
    senderEmails: ["noreply@npmjs.com"]
  },
  {
    id: "discord",
    name: "Discord",
    origins: ["https://discord.com", "https://www.discord.com"],
    senderEmails: ["noreply@discord.com"]
  },
  {
    id: "notion",
    name: "Notion",
    origins: ["https://www.notion.so", "https://notion.so"],
    senderEmails: ["noreply@notion.so"]
  },
  {
    id: "meta",
    name: "Meta",
    origins: ["https://auth.meta.com", "https://www.meta.com", "https://meta.com", "https://muse.ai"],
    senderEmails: ["notification@email.meta.com"]
  }
];
function serviceForOrigin(origin) {
  const hits = SERVICES.filter((service) => service.origins.includes(origin));
  return hits.length === 1 ? hits[0] : null;
}
function serviceById(id) {
  const hits = SERVICES.filter((service) => service.id === id);
  return hits.length === 1 ? hits[0] : null;
}

// src/background/gmail-api-read.ts
async function fetchGmailMessages(token, serviceId) {
  const service = serviceById(serviceId);
  if (!service) return { ok: false, reason: "gmail_api_failed" };
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", buildGmailListQuery(service));
  listUrl.searchParams.set("maxResults", "8");
  try {
    const listResponse = await requestJson(listUrl, token);
    if (!listResponse.ok) return listResponse.result;
    const messages = listResponse.body.messages;
    const ids = Array.isArray(messages) ? messages.map((item) => item?.id).filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, 8) : [];
    const parsed = [];
    for (const id of ids) {
      const itemUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
      itemUrl.searchParams.set("format", "full");
      const itemResponse = await requestJson(itemUrl, token);
      if (!itemResponse.ok) return itemResponse.result;
      const message2 = gmailApiMessageToMail(itemResponse.body);
      if (message2) parsed.push(message2);
    }
    return { ok: true, messages: parsed };
  } catch {
    return { ok: false, reason: "gmail_api_failed" };
  }
}
async function requestJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (response.status === 401 || response.status === 403) return { ok: false, result: { ok: false, reason: "gmail_api_rejected" } };
  if (!response.ok) return { ok: false, result: { ok: false, reason: "gmail_api_failed" } };
  return { ok: true, body: await response.json() };
}

// src/lib/coerce-mail.ts
var READ_REASONS = /* @__PURE__ */ new Set([
  "nothing_visible",
  "signed_out",
  "not_gmail_document",
  "gmail_inbox_too_large",
  "gmail_tab_missing",
  "ambiguous_gmail_tab",
  "gmail_tab_asleep",
  "gmail_tab_unreadable",
  "gmail_api_rejected",
  "gmail_api_failed"
]);
function coerceMessages(input, sourceLabel) {
  if (!Array.isArray(input)) return [];
  const messages = [];
  for (const item of input.slice(0, 25)) {
    const message2 = coerceMessage(item, sourceLabel, messages.length);
    if (message2) messages.push(message2);
  }
  return messages;
}
function coerceReadResult(input, sourceLabel) {
  if (!isPlain(input)) return { ok: false, reason: "gmail_tab_unreadable" };
  if (input.ok === false) {
    const reason = typeof input.reason === "string" && READ_REASONS.has(input.reason) ? input.reason : "gmail_tab_unreadable";
    return { ok: false, reason };
  }
  if (input.ok !== true) return { ok: false, reason: "gmail_tab_unreadable" };
  return { ok: true, messages: coerceMessages(input.messages, sourceLabel) };
}
function coerceMessage(item, sourceLabel, index) {
  if (!isPlain(item)) return null;
  const fromEmail = typeof item.fromEmail === "string" ? normalizeEmail(item.fromEmail) : null;
  const toEmails = Array.isArray(item.toEmails) ? item.toEmails.filter((email) => typeof email === "string").map((email) => normalizeEmail(email)).filter((email) => email !== null).slice(0, 10) : [];
  const subject = typeof item.subject === "string" ? cleanText(item.subject, 300) : "";
  const bodyText = typeof item.bodyText === "string" ? cleanText(item.bodyText, 2e4) : "";
  if (!subject && !bodyText) return null;
  let receivedAt = null;
  if (typeof item.receivedAt === "number" && Number.isFinite(item.receivedAt)) {
    const earliest = Date.UTC(2020, 0, 1);
    const latest = Date.UTC(2100, 0, 1);
    receivedAt = item.receivedAt >= earliest && item.receivedAt <= latest ? item.receivedAt : null;
  }
  const id = typeof item.id === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(item.id) ? item.id : `mail-${index}`;
  return {
    id,
    fromEmail,
    fromDisplay: typeof item.fromDisplay === "string" ? cleanText(item.fromDisplay, 120) : "",
    toEmails,
    subject,
    bodyText,
    receivedAt,
    sourceLabel
  };
}

// src/lib/gmail-tab.ts
function tabMatchesMailbox(url, index) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== "mail.google.com") return false;
  if (parsed.username || parsed.password) return false;
  const numbered = parsed.pathname.match(/^\/mail\/u\/([0-2])(?:\/|$)/);
  if (numbered) return Number(numbered[1]) === index;
  if (index === 0 && /^\/mail\/?$/.test(parsed.pathname)) return true;
  return false;
}
function selectGmailTab(tabs, index) {
  const matching = tabs.filter(
    (tab) => typeof tab.id === "number" && typeof tab.url === "string" && tabMatchesMailbox(tab.url, index)
  );
  if (matching.length === 0) return { ok: false, reason: "gmail_tab_missing" };
  if (matching.length > 1) return { ok: false, reason: "ambiguous_gmail_tab" };
  if (matching[0]?.discarded) return { ok: false, reason: "gmail_tab_asleep" };
  const tabId = matching[0]?.id;
  if (typeof tabId !== "number") return { ok: false, reason: "gmail_tab_missing" };
  return { ok: true, tabId };
}

// src/background/gmail-dom-read.ts
async function readOpenGmailTab(index) {
  const tabs = await chrome.tabs.query({ url: "https://mail.google.com/*" });
  const selected = selectGmailTab(
    tabs.map((tab) => ({ id: tab.id, url: tab.url, discarded: tab.discarded })),
    index
  );
  if (!selected.ok) return selected;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: selected.tabId, allFrames: false },
      world: "ISOLATED",
      files: ["gmail-reader.js"]
    });
    const [ran] = await chrome.scripting.executeScript({
      target: { tabId: selected.tabId, allFrames: false },
      world: "ISOLATED",
      func: () => {
        const reader = globalThis.__kamalReadGmail;
        return typeof reader === "function" ? reader() : { ok: false, reason: "gmail_tab_unreadable" };
      }
    });
    return coerceReadResult(ran?.result, "gmail_dom");
  } catch {
    return { ok: false, reason: "gmail_tab_unreadable" };
  }
}

// src/lib/constants.ts
var ATTEMPT_TTL_MS = 3 * 60 * 1e3;
var FRESHNESS_MS = 10 * 60 * 1e3;
var CLOCK_SKEW_MS = 2 * 60 * 1e3;
var MAX_TOKEN_TTL_MS = 60 * 60 * 1e3;
var GMAIL_DOM_ORIGIN = "https://mail.google.com/*";
var GMAIL_API_ORIGIN = "https://gmail.googleapis.com/*";

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

// src/lib/ids.ts
function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/lib/extract-code.ts
// CodeDrop: codes of 4 to 8 digits. A code right after code wording ("code is:",
// "Login code", "the code below:") is a strong match and wins; otherwise a
// number with code wording nearby is a weak match. Short numbers that look like
// years are only accepted as strong matches.
// A code may run straight into a word ("Code:729739If you have…", Best Buy's
// plain text), but then only right after code wording, never as a weak match.
var CODE = /(?<![0-9A-Za-z])(\d{4,8})(?![0-9])/g;
var LABEL = /verification(?:\s+code)?|security\s+code|log[- ]?in\s+code|sign[- ]?in\s+code|launch\s+code|one[- ]time(?:\s+code|\s+password|\s+passcode)?|single[- ]use\s+code|temporary\s+code|access\s+code|\botp\b|\b2fa\b|passcode|authentication\s+code|authorization\s+code|confirmation\s+code/i;
var LABEL_RIGHT_BEFORE = new RegExp(`(?:${LABEL.source})\\s*(?:is\\s*:?|:|-)?\\s*$`, "i");
function isStrongCodeContext(before) {
  const near = before.slice(-40);
  return LABEL_RIGHT_BEFORE.test(near) || /\bcode\s*(?:is\s*:?|:|-)?\s*$/i.test(near) || /\bcode\b[^0-9]{0,25}:\s*$/i.test(near);
}
function extractCodes(subject, body) {
  const text = `${subject}
${body}`.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 2e4);
  const strong = /* @__PURE__ */ new Set();
  const weak = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(CODE)) {
    const code = match[1];
    if (!code) continue;
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 60), index);
    const after = text.slice(index + code.length, index + code.length + 40);
    if (isExcluded(before) || isUrlNeighbor(before, after)) continue;
    const gluedToWord = /^[A-Za-z]/.test(after);
    if (isStrongCodeContext(before)) {
      strong.add(code);
    } else if (!gluedToWord && (LABEL.test(before) || LABEL.test(after)) && !(code.length === 4 && /^(19|20)\d\d$/.test(code))) {
      weak.add(code);
    }
  }
  return strong.size > 0 ? [...strong] : [...weak];
}
function isExcluded(before) {
  const tail = before.slice(-50);
  return /\b(zip|postal|bar|area|country|promo|discount|error|status|color|hex|order|invoice|tracking|reference)\s+(?:code\s*)?(?:is|:|#)?\s*$/i.test(
    tail
  ) || /\bconfirmation\s+number\s*(?:is|:)?\s*$/i.test(tail);
}
function isUrlNeighbor(before, after) {
  if (/https?:\/\/\S*$/i.test(before.slice(-80))) return true;
  if (/[/@#]$/.test(before.trim())) return true;
  if (/^[/@]/.test(after)) return true;
  return false;
}

// src/lib/match.ts
var RANK = [
  "ambiguous_code",
  "account_mismatch",
  "no_code",
  "stale",
  "future_dated",
  "unknown_age",
  "sender_unverified"
];
function matchCode(input) {
  const { attempt, service, messages, now } = input;
  if (now >= attempt.expiresAt) return { ok: false, reason: "expired_attempt" };
  if (!attempt.origin.startsWith("https://")) return { ok: false, reason: "not_https" };
  if (attempt.serviceId !== service.id || !service.origins.includes(attempt.origin)) {
    return { ok: false, reason: "origin_service_mismatch" };
  }
  if (normalizeEmail(attempt.accountEmail) !== attempt.accountEmail) {
    return { ok: false, reason: "invalid_account" };
  }
  if (messages.length === 0) return { ok: false, reason: "no_messages" };
  const rows = messages.map((message2) => classify(message2, attempt, service, now));
  const matched = rows.filter((row) => row.ok);
  if (matched.length > 1) return { ok: false, reason: "ambiguous_messages" };
  if (matched.length === 1) {
    const winner = matched[0];
    if (!winner.message.fromEmail || winner.message.receivedAt === null) {
      return { ok: false, reason: "sender_unverified" };
    }
    return {
      ok: true,
      code: winner.code,
      messageId: winner.message.id,
      fromEmail: winner.message.fromEmail,
      receivedAt: winner.message.receivedAt,
      sourceLabel: winner.message.sourceLabel
    };
  }
  const reasons = rows.map((row) => row.ok ? "sender_unverified" : row.reason);
  const senderPassed = reasons.filter((reason2) => reason2 !== "sender_unverified");
  const pool = senderPassed.length > 0 ? senderPassed : reasons;
  const reason = RANK.find((candidate) => pool.includes(candidate)) ?? "sender_unverified";
  const counts = /* @__PURE__ */ new Map();
  for (const item of reasons) counts.set(item, (counts.get(item) ?? 0) + 1);
  const detail = counts.size > 1 ? [...counts.entries()].map(([name, count]) => `${count} ${name.replaceAll("_", " ")}`).join(", ") : void 0;
  return detail ? { ok: false, reason, detail } : { ok: false, reason };
}
function classify(message2, attempt, service, now) {
  const from = normalizeEmail(message2.fromEmail);
  if (!from || !service.senderEmails.includes(from)) return { ok: false, reason: "sender_unverified" };
  if (message2.receivedAt === null || !Number.isFinite(message2.receivedAt)) {
    return { ok: false, reason: "unknown_age" };
  }
  if (message2.receivedAt > now + CLOCK_SKEW_MS) return { ok: false, reason: "future_dated" };
  if (now - message2.receivedAt > FRESHNESS_MS) return { ok: false, reason: "stale" };
  if (!accountSeen(message2, attempt.accountEmail)) return { ok: false, reason: "account_mismatch" };
  const codes = extractCodes(message2.subject, message2.bodyText);
  if (codes.length === 0) return { ok: false, reason: "no_code" };
  if (codes.length > 1) return { ok: false, reason: "ambiguous_code" };
  return { ok: true, message: message2, code: codes[0] };
}
function accountSeen(message2, account) {
  const want = normalizeEmail(account);
  if (!want) return false;
  if (message2.toEmails.some((email) => normalizeEmail(email) === want)) return true;
  return mentionsEmail(`${message2.subject}
${message2.bodyText}`, want);
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

// src/lib/types.ts
var DEMO_SCENARIOS = ["single", "ambiguous", "stale", "wrong_account", "lookalike"];

// src/lib/settings.ts
var DEFAULT_SETTINGS = {
  source: null,
  gmailDomOptIn: false,
  oauthClientId: "",
  demoScenario: "single"
};
function isDemoScenario(value) {
  return typeof value === "string" && DEMO_SCENARIOS.includes(value);
}
function sanitizeSettings(raw) {
  if (!isPlain(raw)) return { ...DEFAULT_SETTINGS };
  const source = raw.source === "demo" || raw.source === "gmail_dom" || raw.source === "gmail_api" ? raw.source : null;
  const client = typeof raw.oauthClientId === "string" && (raw.oauthClientId.trim() === "" || isPlausibleClientId(raw.oauthClientId)) ? raw.oauthClientId.trim() : "";
  return {
    source,
    gmailDomOptIn: raw.gmailDomOptIn === true,
    oauthClientId: client,
    demoScenario: isDemoScenario(raw.demoScenario) ? raw.demoScenario : "single"
  };
}

// src/lib/messages.ts
var ALLOWED_KEYS = {
  GET_STATE: ["type"],
  CHOOSE_SOURCE: ["type", "source"],
  SET_DEMO_SCENARIO: ["type", "scenario"],
  SET_OAUTH_CLIENT_ID: ["type", "clientId"],
  STORE_OAUTH_TOKEN: ["type", "accessToken", "expiresAt"],
  DISCONNECT_OAUTH: ["type"],
  REVOKE_GMAIL_DOM: ["type"],
  START_ATTEMPT: ["type", "accountEmail", "serviceId", "mailbox"],
  CHECK_AGAIN: ["type"],
  FILL: ["type"],
  DISMISS: ["type"]
};
function isTrustedPopupSender(sender, extensionId) {
  if (!extensionId || sender.id !== extensionId) return false;
  if (typeof sender.url !== "string") return false;
  let url;
  try {
    url = new URL(sender.url);
  } catch {
    return false;
  }
  if (url.protocol !== "chrome-extension:") return false;
  if (url.hostname !== extensionId) return false;
  if (url.pathname !== "/popup.html") return false;
  if (url.search !== "" || url.hash !== "" || url.username || url.password) return false;
  if (sender.origin && sender.origin !== `chrome-extension://${extensionId}`) return false;
  return true;
}
function parseRequest(message2) {
  if (!isPlain(message2) || typeof message2.type !== "string") return { ok: false, reason: "invalid_request" };
  const allowed = ALLOWED_KEYS[message2.type];
  if (!allowed) return { ok: false, reason: "invalid_request" };
  const keys = Object.keys(message2);
  if (keys.some((key) => !allowed.includes(key))) return { ok: false, reason: "unexpected_fields" };
  switch (message2.type) {
    case "GET_STATE":
    case "DISCONNECT_OAUTH":
    case "REVOKE_GMAIL_DOM":
    case "CHECK_AGAIN":
    case "FILL":
    case "DISMISS":
      return { ok: true, request: { type: message2.type } };
    case "CHOOSE_SOURCE":
      if (message2.source !== "demo" && message2.source !== "gmail_dom" && message2.source !== "gmail_api") {
        return { ok: false, reason: "invalid_request" };
      }
      return { ok: true, request: { type: "CHOOSE_SOURCE", source: message2.source } };
    case "SET_DEMO_SCENARIO":
      if (!isDemoScenario(message2.scenario)) return { ok: false, reason: "invalid_request" };
      return { ok: true, request: { type: "SET_DEMO_SCENARIO", scenario: message2.scenario } };
    case "SET_OAUTH_CLIENT_ID":
      if (typeof message2.clientId !== "string" || message2.clientId.length > 200) {
        return { ok: false, reason: "invalid_request" };
      }
      return { ok: true, request: { type: "SET_OAUTH_CLIENT_ID", clientId: message2.clientId } };
    case "STORE_OAUTH_TOKEN":
      if (typeof message2.accessToken !== "string" || typeof message2.expiresAt !== "number") {
        return { ok: false, reason: "invalid_request" };
      }
      return {
        ok: true,
        request: { type: "STORE_OAUTH_TOKEN", accessToken: message2.accessToken, expiresAt: message2.expiresAt }
      };
    case "START_ATTEMPT": {
      if (typeof message2.accountEmail !== "string" || typeof message2.serviceId !== "string") {
        return { ok: false, reason: "invalid_request" };
      }
      if (message2.accountEmail.length > 254 || message2.serviceId.length > 40) {
        return { ok: false, reason: "invalid_request" };
      }
      if (message2.accountEmail.includes("*") || message2.serviceId.includes("*")) {
        return { ok: false, reason: "unexpected_fields" };
      }
      const mailbox = parseMailbox(message2.mailbox);
      if (!mailbox) return { ok: false, reason: "unexpected_fields" };
      return {
        ok: true,
        request: {
          type: "START_ATTEMPT",
          accountEmail: message2.accountEmail,
          serviceId: message2.serviceId,
          mailbox
        }
      };
    }
    default:
      return { ok: false, reason: "invalid_request" };
  }
}
function parseMailbox(value) {
  if (!isPlain(value)) return null;
  const keys = Object.keys(value);
  if (value.provider === "demo") {
    if (keys.some((key) => key !== "provider" && key !== "scenario")) return null;
    if (!isDemoScenario(value.scenario)) return null;
    return { provider: "demo", scenario: value.scenario };
  }
  if (value.provider === "gmail") {
    if (keys.some((key) => key !== "provider" && key !== "index" && key !== "mode")) return null;
    if (value.index !== 0 && value.index !== 1 && value.index !== 2) return null;
    if (value.mode !== "dom" && value.mode !== "api") return null;
    return { provider: "gmail", index: value.index, mode: value.mode };
  }
  return null;
}

// src/lib/session.ts
function emptySession() {
  return { pending: null, oauthToken: null, notice: null };
}
function sanitizeSession(raw, now) {
  if (!isPlain(raw)) return { state: emptySession(), changed: true, expired: false };
  const oauthToken = sanitizeToken(raw.oauthToken, now);
  const pendingResult = sanitizePending(raw.pending, now);
  const notice = pendingResult.expired ? "expired" : raw.notice === "expired" ? "expired" : null;
  const state = { pending: pendingResult.pending, oauthToken, notice };
  const changed = pendingResult.changed || !sameToken(raw.oauthToken, oauthToken) || (raw.notice ?? null) !== notice || (raw.pending ?? null) !== null && state.pending === null;
  return { state, changed, expired: pendingResult.expired };
}
function sanitizeToken(raw, now) {
  if (!isPlain(raw) || !isAccessToken(raw.accessToken) || typeof raw.expiresAt !== "number") return null;
  if (!Number.isFinite(raw.expiresAt) || raw.expiresAt <= now || raw.expiresAt > now + MAX_TOKEN_TTL_MS) return null;
  return { accessToken: raw.accessToken, expiresAt: raw.expiresAt };
}
function sameToken(raw, token) {
  if (!token) return !isPlain(raw) || raw.accessToken === void 0;
  return isPlain(raw) && raw.accessToken === token.accessToken && raw.expiresAt === token.expiresAt;
}
function sanitizePending(raw, now) {
  if (raw == null) return { pending: null, changed: false, expired: false };
  if (!isPlain(raw) || !isPlain(raw.attempt) || !isPlain(raw.outcome)) {
    return { pending: null, changed: true, expired: false };
  }
  const attempt = sanitizeAttempt(raw.attempt);
  if (!attempt) return { pending: null, changed: true, expired: false };
  if (now >= attempt.expiresAt) return { pending: null, changed: true, expired: true };
  const outcome = sanitizeOutcome(raw.outcome, attempt.mailbox);
  if (!outcome) return { pending: null, changed: true, expired: false };
  return { pending: { attempt, outcome }, changed: false, expired: false };
}
function sanitizeAttempt(raw) {
  if (typeof raw.id !== "string" || !/^[a-f0-9]{32}$/.test(raw.id)) return null;
  if (typeof raw.origin !== "string" || !raw.origin.startsWith("https://")) return null;
  if (typeof raw.tabId !== "number" || !Number.isInteger(raw.tabId) || raw.tabId < 0) return null;
  if (typeof raw.accountEmail !== "string" || normalizeEmail(raw.accountEmail) !== raw.accountEmail) return null;
  if (typeof raw.serviceId !== "string") return null;
  const service = serviceById(raw.serviceId);
  if (!service || !service.origins.includes(raw.origin)) return null;
  if (typeof raw.createdAt !== "number" || typeof raw.expiresAt !== "number") return null;
  if (raw.expiresAt - raw.createdAt !== ATTEMPT_TTL_MS) return null;
  const mailbox = sanitizeMailbox(raw.mailbox);
  if (!mailbox) return null;
  return {
    id: raw.id,
    origin: raw.origin,
    tabId: raw.tabId,
    accountEmail: raw.accountEmail,
    serviceId: raw.serviceId,
    mailbox,
    createdAt: raw.createdAt,
    expiresAt: raw.expiresAt
  };
}
function sanitizeMailbox(raw) {
  if (!isPlain(raw)) return null;
  if (raw.provider === "demo" && isDemoScenario(raw.scenario) && Object.keys(raw).every((key) => key === "provider" || key === "scenario")) {
    return { provider: "demo", scenario: raw.scenario };
  }
  if (raw.provider === "gmail" && (raw.index === 0 || raw.index === 1 || raw.index === 2) && (raw.mode === "dom" || raw.mode === "api") && Object.keys(raw).every((key) => key === "provider" || key === "index" || key === "mode")) {
    return { provider: "gmail", index: raw.index, mode: raw.mode };
  }
  return null;
}
function sanitizeOutcome(raw, mailbox) {
  const expected = sourceForMailbox(mailbox);
  if (raw.kind === "filled" && raw.sourceLabel === expected) return { kind: "filled", sourceLabel: expected };
  if (raw.kind === "failed" && typeof raw.reason === "string" && /^[a-z_]{3,64}$/.test(raw.reason)) {
    if (raw.detail === void 0) return { kind: "failed", reason: raw.reason };
    if (typeof raw.detail === "string" && /^(\d+ [a-z ]+)(, \d+ [a-z ]+)*$/.test(raw.detail) && raw.detail.length < 200) {
      return { kind: "failed", reason: raw.reason, detail: raw.detail };
    }
    return null;
  }
  if (raw.kind !== "matched" || !isPlain(raw.match)) return null;
  const match = sanitizeMatch(raw.match, expected);
  return match ? { kind: "matched", match } : null;
}
function sanitizeMatch(raw, expected) {
  if (raw.sourceLabel !== expected) return null;
  if (typeof raw.code !== "string" || !/^\d{6}$/.test(raw.code)) return null;
  if (typeof raw.fromEmail !== "string" || normalizeEmail(raw.fromEmail) !== raw.fromEmail) return null;
  if (typeof raw.receivedAt !== "number" || !Number.isFinite(raw.receivedAt)) return null;
  if (typeof raw.messageId !== "string" || raw.messageId.length < 1 || raw.messageId.length > 80) return null;
  return {
    code: raw.code,
    fromEmail: raw.fromEmail,
    receivedAt: raw.receivedAt,
    messageId: raw.messageId,
    sourceLabel: expected
  };
}
function sourceForMailbox(mailbox) {
  if (mailbox.provider === "demo") return "fixture";
  return mailbox.mode === "dom" ? "gmail_dom" : "gmail_api";
}

// src/lib/tabs.ts
function classifyLocation(url, id) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "none" };
  }
  if (parsed.username || parsed.password) return { kind: "none" };
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { kind: "none" };
  if (parsed.protocol !== "https:") return { kind: "not_https", id, origin: parsed.origin, url };
  const service = serviceForOrigin(parsed.origin);
  if (!service) return { kind: "unsupported", id, origin: parsed.origin, url };
  return {
    kind: "ready",
    id,
    origin: parsed.origin,
    url,
    serviceId: service.id,
    serviceName: service.name
  };
}
function isReady(tab) {
  return tab.kind === "ready";
}

// src/background/handle.ts
async function handleMessage(deps2, message2, sender) {
  if (!isTrustedPopupSender(sender, deps2.extensionId)) {
    return { ok: false, reason: "untrusted_sender" };
  }
  const parsed = parseRequest(message2);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  try {
    switch (parsed.request.type) {
      case "GET_STATE":
        return { ok: true, view: await viewOf(deps2) };
      case "CHOOSE_SOURCE":
        return chooseSource(deps2, parsed.request.source);
      case "SET_DEMO_SCENARIO":
        return setScenario(deps2, parsed.request.scenario);
      case "SET_OAUTH_CLIENT_ID":
        return setClientId(deps2, parsed.request.clientId);
      case "STORE_OAUTH_TOKEN":
        return storeToken(deps2, parsed.request);
      case "DISCONNECT_OAUTH":
        return disconnect(deps2);
      case "REVOKE_GMAIL_DOM":
        return revokeGmail(deps2);
      case "START_ATTEMPT":
        return startAttempt(deps2, parsed.request);
      case "CHECK_AGAIN":
        return checkAgain(deps2);
      case "FILL":
        return fill(deps2);
      case "DISMISS":
        return dismiss(deps2);
      default:
        return { ok: false, reason: "invalid_request" };
    }
  } catch (error) {
    console.warn("kamal", error instanceof Error ? error.name : "error");
    return { ok: false, reason: "internal_error" };
  }
}
async function chooseSource(deps2, source) {
  const { settings, session } = await load(deps2);
  const next = {
    ...settings,
    source,
    gmailDomOptIn: source === "gmail_dom" ? true : settings.gmailDomOptIn
  };
  await deps2.storage.setLocal(next);
  await persist(deps2, { ...session, pending: null, notice: null });
  return { ok: true, view: await viewOf(deps2) };
}
async function setScenario(deps2, scenario) {
  const { settings, session } = await load(deps2);
  await deps2.storage.setLocal({ ...settings, demoScenario: scenario });
  await persist(deps2, { ...session, pending: null, notice: null });
  return { ok: true, view: await viewOf(deps2) };
}
async function setClientId(deps2, clientId) {
  const trimmed = clientId.trim();
  if (trimmed !== "" && !isPlausibleClientId(trimmed)) return noted(deps2, "invalid_client_id");
  const { settings, session } = await load(deps2);
  await deps2.storage.setLocal({ ...settings, oauthClientId: trimmed });
  if (trimmed === "") await persist(deps2, { ...session, oauthToken: null });
  return { ok: true, view: await viewOf(deps2) };
}
async function storeToken(deps2, request) {
  const now = deps2.now();
  if (!isAccessToken(request.accessToken) || request.expiresAt <= now || request.expiresAt > now + MAX_TOKEN_TTL_MS) {
    return noted(deps2, "invalid_token");
  }
  const { session } = await load(deps2);
  await persist(deps2, {
    ...session,
    oauthToken: { accessToken: request.accessToken, expiresAt: request.expiresAt }
  });
  return { ok: true, view: await viewOf(deps2) };
}
async function disconnect(deps2) {
  const { session } = await load(deps2);
  await persist(deps2, { ...session, oauthToken: null });
  return { ok: true, view: await viewOf(deps2) };
}
async function revokeGmail(deps2) {
  const { settings, session } = await load(deps2);
  await deps2.storage.setLocal({
    ...settings,
    gmailDomOptIn: false,
    source: settings.source === "gmail_dom" ? null : settings.source
  });
  await persist(deps2, { ...session, pending: null, notice: null });
  await deps2.permissions.revokeGmailDom();
  return { ok: true, view: await viewOf(deps2) };
}
async function dismiss(deps2) {
  const { session } = await load(deps2);
  await persist(deps2, { ...session, pending: null, notice: null });
  return { ok: true, view: await viewOf(deps2) };
}
async function startAttempt(deps2, request) {
  const { settings, session } = await load(deps2);
  if (!settings.source) return noted(deps2, "needs_setup");
  if (!mailboxAgrees(settings, request.mailbox)) return noted(deps2, "source_mismatch");
  const tab = await deps2.getTargetTab();
  if (tab.kind === "none") return noted(deps2, "no_tab");
  if (tab.kind === "ambiguous") return noted(deps2, "ambiguous_target");
  if (tab.kind === "not_https") return noted(deps2, "not_https");
  if (tab.kind === "unsupported") return noted(deps2, "unsupported_origin");
  if (tab.serviceId !== request.serviceId) return noted(deps2, "origin_service_mismatch");
  const accountEmail = normalizeEmail(request.accountEmail);
  if (!accountEmail) return noted(deps2, "invalid_account");
  const now = deps2.now();
  const attempt = {
    id: randomId(),
    origin: tab.origin,
    tabId: tab.id,
    accountEmail,
    serviceId: tab.serviceId,
    mailbox: request.mailbox,
    createdAt: now,
    expiresAt: now + ATTEMPT_TTL_MS
  };
  const read = await readMailbox(deps2, settings, session, attempt.serviceId, request.mailbox);
  if (!read.ok) {
    await persist(deps2, { ...session, notice: null, pending: { attempt, outcome: { kind: "failed", reason: read.reason } } });
    return noted(deps2, read.reason);
  }
  const service = serviceById(attempt.serviceId);
  if (!service) return noted(deps2, "origin_service_mismatch");
  const result = matchCode({ attempt, service, messages: read.messages, now });
  if (!result.ok) {
    await persist(deps2, {
      ...session,
      notice: null,
      pending: {
        attempt,
        outcome: result.detail ? { kind: "failed", reason: result.reason, detail: result.detail } : { kind: "failed", reason: result.reason }
      }
    });
    return noted(deps2, result.reason);
  }
  await persist(deps2, {
    ...session,
    notice: null,
    pending: {
      attempt,
      outcome: {
        kind: "matched",
        match: {
          code: result.code,
          fromEmail: result.fromEmail,
          receivedAt: result.receivedAt,
          messageId: result.messageId,
          sourceLabel: result.sourceLabel
        }
      }
    }
  });
  return { ok: true, view: await viewOf(deps2) };
}
async function checkAgain(deps2) {
  const { settings, session, expired } = await load(deps2);
  if (expired) return noted(deps2, "expired_attempt");
  if (!session.pending) return noted(deps2, "no_attempt");
  if (session.pending.outcome.kind === "filled") return noted(deps2, "already_filled");
  const attempt = session.pending.attempt;
  if (deps2.now() >= attempt.expiresAt) {
    await persist(deps2, { ...session, pending: null, notice: "expired" });
    return noted(deps2, "expired_attempt");
  }
  const stored = await deps2.getTabById(attempt.tabId);
  if (!isReady(stored) || stored.origin !== attempt.origin || stored.serviceId !== attempt.serviceId) {
    await persist(deps2, { ...session, pending: null, notice: null });
    return noted(deps2, "tab_changed");
  }
  const read = await readMailbox(deps2, settings, session, attempt.serviceId, attempt.mailbox);
  if (!read.ok) {
    await persist(deps2, { ...session, pending: { attempt, outcome: { kind: "failed", reason: read.reason } } });
    return noted(deps2, read.reason);
  }
  const service = serviceById(attempt.serviceId);
  if (!service) return noted(deps2, "origin_service_mismatch");
  const result = matchCode({ attempt, service, messages: read.messages, now: deps2.now() });
  if (!result.ok) {
    await persist(deps2, {
      ...session,
      pending: {
        attempt,
        outcome: result.detail ? { kind: "failed", reason: result.reason, detail: result.detail } : { kind: "failed", reason: result.reason }
      }
    });
    return noted(deps2, result.reason);
  }
  await persist(deps2, {
    ...session,
    pending: {
      attempt,
      outcome: {
        kind: "matched",
        match: {
          code: result.code,
          fromEmail: result.fromEmail,
          receivedAt: result.receivedAt,
          messageId: result.messageId,
          sourceLabel: result.sourceLabel
        }
      }
    }
  });
  return { ok: true, view: await viewOf(deps2) };
}
async function fill(deps2) {
  const { session, expired } = await load(deps2);
  if (expired) return noted(deps2, "expired_attempt");
  if (!session.pending) return noted(deps2, "no_attempt");
  if (deps2.now() >= session.pending.attempt.expiresAt) {
    await persist(deps2, { ...session, pending: null, notice: "expired" });
    return noted(deps2, "expired_attempt");
  }
  if (session.pending.outcome.kind !== "matched") return noted(deps2, "not_matched");
  const attempt = session.pending.attempt;
  const match = session.pending.outcome.match;
  const stored = await deps2.getTabById(attempt.tabId);
  if (!isReady(stored) || stored.origin !== attempt.origin) {
    await persist(deps2, { ...session, pending: null, notice: null });
    return noted(deps2, "tab_changed");
  }
  let storedOrigin = "";
  try {
    storedOrigin = new URL(stored.url).origin;
  } catch {
    await persist(deps2, { ...session, pending: null, notice: null });
    return noted(deps2, "tab_changed");
  }
  if (storedOrigin !== attempt.origin) {
    await persist(deps2, { ...session, pending: null, notice: null });
    return noted(deps2, "tab_changed");
  }
  const current = await deps2.getTargetTab();
  if (!isReady(current) || current.id !== attempt.tabId || current.origin !== attempt.origin) {
    return noted(deps2, "tab_not_active");
  }
  const filled = await deps2.fillTab(attempt.tabId, match.code);
  if (!filled.ok) return noted(deps2, filled.reason);
  await persist(deps2, {
    ...session,
    pending: { attempt, outcome: { kind: "filled", sourceLabel: match.sourceLabel } }
  });
  const view = await viewOf(deps2);
  return { ok: true, view: { ...view, note: filledNote(match.sourceLabel) } };
}
async function readMailbox(deps2, settings, session, serviceId, mailbox) {
  if (mailbox.provider === "demo") {
    if (settings.source !== "demo") return { ok: false, reason: "source_mismatch" };
    return { ok: true, messages: coerceMessages(deps2.loadDemo(mailbox.scenario, deps2.now()), "fixture") };
  }
  if (mailbox.mode === "dom") {
    if (!settings.gmailDomOptIn) return { ok: false, reason: "gmail_opt_in_missing" };
    if (!await deps2.permissions.containsOrigin(GMAIL_DOM_ORIGIN)) {
      return { ok: false, reason: "gmail_permission_missing" };
    }
    const read2 = await deps2.readGmailDom(mailbox.index);
    if (!read2.ok) return read2;
    return { ok: true, messages: coerceMessages(read2.messages, "gmail_dom") };
  }
  if (!isPlausibleClientId(settings.oauthClientId)) return { ok: false, reason: "oauth_not_configured" };
  if (!session.oauthToken) return { ok: false, reason: "oauth_not_connected" };
  if (!await deps2.permissions.containsOrigin(GMAIL_API_ORIGIN)) {
    return { ok: false, reason: "gmail_api_permission_missing" };
  }
  const read = await deps2.readGmailApi(session.oauthToken.accessToken, serviceId);
  if (!read.ok) return read;
  return { ok: true, messages: coerceMessages(read.messages, "gmail_api") };
}
async function load(deps2) {
  const settings = sanitizeSettings(await deps2.storage.getLocal());
  const sanitized = sanitizeSession(await deps2.storage.getSession(), deps2.now());
  let session = sanitized.state;
  let changed = sanitized.changed;
  if (session.pending && !mailboxAgrees(settings, session.pending.attempt.mailbox)) {
    session = { ...session, pending: null };
    changed = true;
  }
  if (changed) await deps2.storage.setSession(session);
  return { settings, session, expired: sanitized.expired };
}
function mailboxAgrees(settings, mailbox) {
  if (mailbox.provider === "demo") return settings.source === "demo" && settings.demoScenario === mailbox.scenario;
  if (mailbox.mode === "dom") return settings.source === "gmail_dom";
  return settings.source === "gmail_api";
}
async function viewOf(deps2, note = null) {
  let { settings, session } = await load(deps2);
  let tab = { kind: "none" };
  if (session.pending) {
    const stored = await deps2.getTabById(session.pending.attempt.tabId);
    if (!isReady(stored) || stored.origin !== session.pending.attempt.origin) {
      session = { ...session, pending: null };
      await deps2.storage.setSession(session);
      tab = await deps2.getTargetTab();
    } else {
      tab = stored;
    }
  } else {
    tab = await deps2.getTargetTab();
  }
  const [gmailDomPermission, gmailApiPermission, identityPermission] = await Promise.all([
    deps2.permissions.containsOrigin(GMAIL_DOM_ORIGIN),
    deps2.permissions.containsOrigin(GMAIL_API_ORIGIN),
    deps2.permissions.containsIdentity()
  ]);
  return {
    supported: SERVICES.map((service) => ({ id: service.id, name: service.name, origins: [...service.origins] })),
    source: settings.source,
    demoScenario: settings.demoScenario,
    gmailDomOptIn: settings.gmailDomOptIn,
    gmailDomPermission,
    gmailApiPermission,
    identityPermission,
    oauthConfigured: isPlausibleClientId(settings.oauthClientId),
    oauthClientId: settings.oauthClientId,
    oauthConnected: session.oauthToken !== null,
    redirectUri: deps2.redirectUri(),
    tab: toTabView(tab),
    pending: toPendingView(session, deps2.now()),
    notice: session.notice,
    note
  };
}
function toTabView(tab) {
  if (tab.kind === "ready") {
    return {
      kind: "ready",
      origin: tab.origin,
      serviceId: tab.serviceId,
      serviceName: tab.serviceName,
      tabId: tab.id
    };
  }
  if (tab.kind === "not_https" || tab.kind === "unsupported") return { kind: tab.kind, origin: tab.origin };
  return { kind: tab.kind };
}
function toPendingView(session, now) {
  if (!session.pending) return null;
  const { attempt, outcome } = session.pending;
  if (outcome.kind === "filled") return { kind: "filled", sourceLabel: outcome.sourceLabel, expiresAt: attempt.expiresAt };
  if (outcome.kind === "failed") {
    const copy = explain(outcome.reason);
    const body = outcome.detail ? `${copy.body} (${outcome.detail})` : copy.body;
    return { kind: "failed", reason: outcome.reason, title: copy.title, body, expiresAt: attempt.expiresAt };
  }
  const service = serviceById(attempt.serviceId);
  return {
    kind: "matched",
    accountEmail: attempt.accountEmail,
    serviceId: attempt.serviceId,
    serviceName: service?.name ?? attempt.serviceId,
    fromEmail: outcome.match.fromEmail,
    ageSeconds: Math.max(0, Math.round((now - outcome.match.receivedAt) / 1e3)),
    code: outcome.match.code,
    expiresAt: attempt.expiresAt,
    sourceLabel: outcome.match.sourceLabel
  };
}
async function noted(deps2, reason) {
  const view = await viewOf(deps2);
  return { ok: false, reason, view: { ...view, note: explain(reason) } };
}
async function persist(deps2, session) {
  await deps2.storage.setSession(session);
}

// src/lib/demo-fixtures.ts
function demoMessages(scenario, now) {
  const fresh = now - 6e4;
  const lookalike = message({
    id: "fixture-lookalike",
    fromEmail: "noreply@github.com.evil.test",
    fromDisplay: "GitHub",
    toEmails: ["ada@example.com"],
    subject: "Your GitHub verification code",
    bodyText: "Your verification code is 999999 for ada@example.com. Fixture data.",
    receivedAt: fresh
  });
  if (scenario === "lookalike") return [lookalike];
  if (scenario === "stale") {
    return [
      message({
        id: "fixture-stale",
        fromEmail: "noreply@github.com",
        fromDisplay: "GitHub",
        toEmails: ["ada@example.com"],
        subject: "Older GitHub verification code",
        bodyText: "Your verification code is 111333 for ada@example.com. Fixture data.",
        receivedAt: now - 30 * 6e4
      }),
      lookalike
    ];
  }
  if (scenario === "wrong_account") {
    return [
      message({
        id: "fixture-other-account",
        fromEmail: "noreply@github.com",
        fromDisplay: "GitHub",
        toEmails: ["bea@example.com"],
        subject: "Your GitHub verification code",
        bodyText: "Your verification code is 771054 for bea@example.com. Fixture data.",
        receivedAt: fresh
      }),
      lookalike
    ];
  }
  if (scenario === "ambiguous") {
    return [
      message({
        id: "fixture-ambiguous-a",
        fromEmail: "noreply@github.com",
        fromDisplay: "GitHub",
        toEmails: ["ada@example.com"],
        subject: "Your GitHub verification code",
        bodyText: "Your verification code is 483921 for ada@example.com. Fixture data.",
        receivedAt: fresh
      }),
      message({
        id: "fixture-ambiguous-b",
        fromEmail: "noreply@github.com",
        fromDisplay: "GitHub",
        toEmails: ["ada@example.com"],
        subject: "Another GitHub verification code",
        bodyText: "Your verification code is 120045 for ada@example.com. Fixture data.",
        receivedAt: now - 5e4
      }),
      lookalike
    ];
  }
  return [
    message({
      id: "fixture-github-ada",
      fromEmail: "noreply@github.com",
      fromDisplay: "GitHub",
      toEmails: ["ada@example.com"],
      subject: "Your GitHub verification code",
      bodyText: "Hello ada@example.com. Your verification code is 483921. This message is fixture data, not mail from GitHub.",
      receivedAt: fresh
    }),
    message({
      id: "fixture-npm-ada",
      fromEmail: "noreply@npmjs.com",
      fromDisplay: "npm",
      toEmails: ["ada@example.com"],
      subject: "npm login verification",
      bodyText: "Your npm verification code is 190442 for ada@example.com. Fixture data.",
      receivedAt: now - 9e4
    }),
    message({
      id: "fixture-discord-bea",
      fromEmail: "noreply@discord.com",
      fromDisplay: "Discord",
      toEmails: ["bea@example.com"],
      subject: "Your Discord login code",
      bodyText: "Your Discord verification code is 660918 for bea@example.com. Fixture data.",
      receivedAt: now - 3e4
    }),
    message({
      id: "fixture-github-stale",
      fromEmail: "noreply@github.com",
      fromDisplay: "GitHub",
      toEmails: ["ada@example.com"],
      subject: "Older GitHub verification code",
      bodyText: "Your verification code is 111333 for ada@example.com. Fixture data.",
      receivedAt: now - 30 * 6e4
    }),
    lookalike
  ];
}
function message(input) {
  return {
    id: input.id,
    fromEmail: input.fromEmail,
    fromDisplay: input.fromDisplay,
    toEmails: input.toEmails,
    subject: input.subject,
    bodyText: input.bodyText,
    receivedAt: input.receivedAt,
    sourceLabel: "fixture"
  };
}

// src/background/index.ts
var deps = {
  extensionId: chrome.runtime.id,
  now: () => Date.now(),
  redirectUri: () => `https://${chrome.runtime.id}.chromiumapp.org/`,
  storage: {
    async getLocal() {
      const stored = await chrome.storage.local.get("kamalSettings");
      return sanitizeSettings(stored.kamalSettings);
    },
    async setLocal(settings) {
      await chrome.storage.local.set({ kamalSettings: settings });
    },
    async getSession() {
      const stored = await chrome.storage.session.get("kamalSession");
      return stored.kamalSession ?? null;
    },
    async setSession(state) {
      await chrome.storage.session.set({ kamalSession: state });
    }
  },
  permissions: {
    containsOrigin(origin) {
      return chrome.permissions.contains({ origins: [origin] });
    },
    containsIdentity() {
      return chrome.permissions.contains({ permissions: ["identity"] });
    },
    async revokeGmailDom() {
      await chrome.permissions.remove({ origins: [GMAIL_DOM_ORIGIN] });
    }
  },
  getTargetTab,
  getTabById,
  loadDemo: demoMessages,
  readGmailDom: readOpenGmailTab,
  readGmailApi: fetchGmailMessages,
  fillTab
};
chrome.runtime.onMessage.addListener((message2, sender, sendResponse) => {
  if (isCodeDropMessage(message2)) return false;
  void handleMessage(deps, message2, sender).then(sendResponse).catch(() => sendResponse({ ok: false, reason: "internal_error" }));
  return true;
});
async function getTargetTab() {
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (current?.id && current.url && isWebPage(current.url)) return classifyLocation(current.url, current.id);
  const tabs = await chrome.tabs.query({});
  const ready = tabs.filter((tab) => tab.id && tab.url && classifyLocation(tab.url, tab.id).kind === "ready");
  if (ready.length > 1) return { kind: "ambiguous" };
  const only = ready[0];
  if (only?.id && only.url) return classifyLocation(only.url, only.id);
  const pages = tabs.filter((tab) => tab.id && tab.url && isWebPage(tab.url));
  if (pages.length === 1 && pages[0]?.id && pages[0].url) return classifyLocation(pages[0].url, pages[0].id);
  return { kind: "none" };
}
async function getTabById(id) {
  try {
    const tab = await chrome.tabs.get(id);
    if (!tab.id || !tab.url) return { kind: "none" };
    return classifyLocation(tab.url, tab.id);
  } catch {
    return { kind: "none" };
  }
}
async function fillTab(tabId, code) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: "ISOLATED",
      files: ["fill-code.js"]
    });
    const [ran] = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: "ISOLATED",
      args: [code],
      func: (value) => {
        const fill2 = globalThis.__kamalFillCode;
        return typeof fill2 === "function" ? fill2(value) : { ok: false, reason: "fill_missing" };
      }
    });
    const result = ran?.result;
    if (isFillResult(result)) return result;
    return { ok: false, reason: "fill_missing" };
  } catch {
    return { ok: false, reason: "fill_missing" };
  }
}
function isWebPage(url) {
  return url.startsWith("https://") || url.startsWith("http://");
}
function isFillResult(value) {
  if (!value || typeof value !== "object") return false;
  const record = value;
  if (record.ok === true) return record.mode === "one-time-code" || record.mode === "split" || record.mode === "labeled";
  return record.ok === false && (record.reason === "invalid_code" || record.reason === "not_https" || record.reason === "no_field" || record.reason === "ambiguous_field" || record.reason === "fill_missing");
}

// ---------------------------------------------------------------------------
// CodeDrop: on-page code suggestions from Gmail (added by hand, not in the
// original Kamal source tree).
//
// Rule: a code is offered on a website only if Gmail itself verified that the
// email came from the same company as that website (DMARC pass, or DKIM pass
// aligned with the From domain), comparing registrable domains, e.g.
// github.com page <-> noreply@github.com. A short alias table covers companies
// that send from a different domain they own (muse.ai <-> meta.com).
// ---------------------------------------------------------------------------
var CD_FRESH_MS = 10 * 60 * 1e3;
var CD_FUTURE_SKEW_MS = 2 * 60 * 1e3;
var CD_LIST_LIMIT = 10;
var cdParsedCache = /* @__PURE__ */ new Map();

// Multi-label public suffixes and shared hosting platforms. Not the full
// Public Suffix List; anything missing falls back to "last two labels".
var CD_MULTI_SUFFIXES = /* @__PURE__ */ new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.nz", "org.nz", "net.nz",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp", "co.kr", "or.kr", "ac.kr",
  "com.br", "net.br", "org.br", "gov.br", "com.mx", "org.mx", "gob.mx", "com.ar", "com.co", "com.pe", "com.uy", "com.ec",
  "com.tr", "com.sg", "edu.sg", "com.hk", "org.hk", "com.tw", "org.tw", "com.cn", "net.cn", "org.cn", "gov.cn",
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "gov.in",
  "co.za", "org.za", "com.my", "com.ph", "com.pk", "com.vn", "com.eg", "com.sa", "com.ng", "com.bd",
  "co.id", "or.id", "co.il", "org.il", "co.th", "in.th", "com.ua", "com.pl", "co.at", "or.at", "co.ke",
  "github.io", "gitlab.io", "vercel.app", "netlify.app", "herokuapp.com", "pages.dev", "workers.dev",
  "web.app", "firebaseapp.com", "appspot.com", "blogspot.com", "azurewebsites.net", "cloudfront.net",
  "amazonaws.com", "onrender.com", "fly.dev", "glitch.me", "replit.app", "repl.co", "surge.sh",
  "wixsite.com", "weebly.com", "ngrok.io", "ngrok-free.app", "trycloudflare.com", "framer.website", "webflow.io"
]);
function cdRegistrable(host) {
  if (typeof host !== "string") return null;
  const name = host.toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(name) || !name.includes(".") || /^[0-9.]+$/.test(name)) return null;
  const parts = name.split(".");
  if (parts.some((part) => part.length === 0)) return null;
  for (let n = Math.min(parts.length, 3); n >= 2; n--) {
    if (CD_MULTI_SUFFIXES.has(parts.slice(-n).join("."))) {
      return parts.length > n ? parts.slice(-(n + 1)).join(".") : null;
    }
  }
  return parts.slice(-2).join(".");
}

// Sites where users or customers publish their own pages on subdomains
// (blogs, publications, tenant portals). A user-made page there must never be
// offered the company's login code, so only the listed hosts count.
var CD_ONLY_HOSTS = {
  "tumblr.com": ["tumblr.com", "www.tumblr.com"],
  "substack.com": ["substack.com", "www.substack.com"],
  "medium.com": ["medium.com", "www.medium.com"],
  "wordpress.com": ["wordpress.com", "www.wordpress.com"],
  "salesforce.com": ["salesforce.com", "www.salesforce.com", "login.salesforce.com"],
  "force.com": [],
  "atlassian.net": [],
  "myshopify.com": [],
  "sharepoint.com": [],
  "notion.site": [],
  "zendesk.com": ["zendesk.com", "www.zendesk.com"],
  "squarespace.com": ["squarespace.com", "www.squarespace.com", "account.squarespace.com", "login.squarespace.com"],
  "neocities.org": ["neocities.org"],
  "carrd.co": []
};
function cdHostAllowed(hostname, reg) {
  const only = CD_ONLY_HOSTS[reg];
  return !only || only.includes(hostname);
}

// Same-owner domains: site domain -> sender domains that may send its codes.
// Add only pairs owned by the same company. The SERVICES list above is
// folded in automatically (e.g. muse.ai -> email.meta.com).
var CD_ALIASES = {
  "muse.ai": ["meta.com"],
  "facebook.com": ["facebookmail.com", "meta.com"],
  "messenger.com": ["facebookmail.com", "meta.com"],
  "instagram.com": ["meta.com", "facebookmail.com"],
  "threads.net": ["instagram.com", "meta.com"],
  "threads.com": ["instagram.com", "meta.com"],
  "oculus.com": ["meta.com"],
  "live.com": ["microsoft.com"],
  "outlook.com": ["microsoft.com"],
  "microsoftonline.com": ["microsoft.com"],
  "office.com": ["microsoft.com"],
  "microsoft365.com": ["microsoft.com"],
  "xbox.com": ["microsoft.com"],
  "skype.com": ["microsoft.com"],
  "bing.com": ["microsoft.com"],
  "youtube.com": ["google.com"],
  "icloud.com": ["apple.com"],
  "twitter.com": ["x.com"],
  "x.com": ["twitter.com"],
  "steamcommunity.com": ["steampowered.com"],
  "atlassian.net": ["atlassian.com"],
  "bitbucket.org": ["atlassian.com"],
  "amazon.com": ["amazonaws.com"],
  "eufy.com": ["eufylife.com"]
};
function cdAllowedSenders(siteReg) {
  const allowed = /* @__PURE__ */ new Set([siteReg]);
  for (const alias of CD_ALIASES[siteReg] || []) {
    const reg = cdRegistrable(alias);
    if (reg) allowed.add(reg);
  }
  for (const service of SERVICES) {
    const serves = service.origins.some((origin) => {
      try {
        return cdRegistrable(new URL(origin).hostname) === siteReg;
      } catch {
        return false;
      }
    });
    if (!serves) continue;
    for (const sender of service.senderEmails) {
      const reg = cdRegistrable(sender.split("@")[1]);
      if (reg) allowed.add(reg);
    }
  }
  return allowed;
}

function isCodeDropMessage(message) {
  return isPlain(message) && typeof message.type === "string" && message.type.startsWith("CD_");
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isCodeDropMessage(message)) return false;
  void cdHandle(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, reason: "internal_error" }));
  return true;
});
// The asking frame's own https origin decides which company's codes it may see.
function cdSenderSite(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return null;
  if (!sender.tab || typeof sender.tab.id !== "number") return null;
  let origin = typeof sender.origin === "string" ? sender.origin : null;
  if (!origin && typeof sender.url === "string") {
    try {
      origin = new URL(sender.url).origin;
    } catch {
      origin = null;
    }
  }
  if (!origin || !origin.startsWith("https://")) return null;
  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return null;
  }
  if (hostname === "mail.google.com") return null;
  const reg = cdRegistrable(hostname);
  if (!reg || !cdHostAllowed(hostname, reg)) return null;
  return { origin, hostname, reg };
}
async function cdHandle(message, sender) {
  switch (message.type) {
    case "CD_CHECK": {
      const site = cdSenderSite(sender);
      if (!site) return { ok: false, reason: "unsupported_site" };
      const token = await cdToken(false);
      if (!token) return { ok: false, reason: "needs_setup", siteName: cdCompanyName(site.reg) };
      const found = await cdFindCode(site, token);
      return { ...found, siteName: cdCompanyName(site.reg) };
    }
    case "CD_OPEN_SETUP": {
      if (!cdSenderSite(sender)) return { ok: false, reason: "unsupported_site" };
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    }
    case "CD_SITES": {
      if (!cdFromExtensionPage(sender, ["setup.html"])) return { ok: false, reason: "invalid_request" };
      return { ok: true, aliases: CD_ALIASES, builtIn: [...cdBuiltInRegs()].sort(), enabled: (await cdEnabledRegs()).sort() };
    }
    case "CD_TAB_STATUS": {
      if (!cdFromExtensionPage(sender, ["toolbar.html"])) return { ok: false, reason: "invalid_request" };
      return cdTabStatus(message.url);
    }
    case "CD_SITE_ENABLED": {
      if (!cdFromExtensionPage(sender, ["toolbar.html", "setup.html"])) return { ok: false, reason: "invalid_request" };
      await cdSyncSiteScripts();
      if (typeof message.tabId === "number") await cdInjectIntoTab(message.tabId);
      return { ok: true };
    }
    default:
      return { ok: false, reason: "invalid_request" };
  }
}
async function cdToken(interactive) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    const token = typeof result === "string" ? result : result?.token;
    return isAccessToken(token) ? token : null;
  } catch {
    return null;
  }
}
async function cdGmail(path, token) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (response.status === 401) {
    try {
      await chrome.identity.removeCachedAuthToken({ token });
    } catch {
    }
    return { ok: false, reason: "needs_setup" };
  }
  if (response.status === 403) return { ok: false, reason: "gmail_api_rejected" };
  if (!response.ok) return { ok: false, reason: "gmail_api_failed" };
  return { ok: true, body: await response.json() };
}
// Only recent, received mail that looks like a sign-in email is fetched.
function cdListQuery(now) {
  const after = Math.floor((now - CD_FRESH_MS) / 1e3);
  return `after:${after} -in:sent -in:chats -in:drafts {code verification verify passcode otp "one-time" "sign in" "log in" login "security"}`;
}
async function cdFindCode(site, token) {
  const now = Date.now();
  const list = await cdGmail(`messages?maxResults=${CD_LIST_LIMIT}&q=${encodeURIComponent(cdListQuery(now))}`, token);
  if (!list.ok) return list;
  const ids = Array.isArray(list.body.messages) ? list.body.messages.map((item) => item?.id).filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, CD_LIST_LIMIT) : [];
  const candidates = [];
  for (const id of ids) {
    if (!cdParsedCache.has(id)) {
      const item = await cdGmail(`messages/${id}?format=full`, token);
      if (!item.ok) return item;
      cdParsedCache.set(id, cdParseMessage(item.body));
      if (cdParsedCache.size > 80) cdParsedCache.delete(cdParsedCache.keys().next().value);
    }
    const parsed = cdParsedCache.get(id);
    if (parsed) candidates.push(parsed);
  }
  return cdPickCode(candidates, site, now);
}
function cdDisplayName(fromHeader) {
  const match = /^\s*"?([^"<]{1,60}?)"?\s*</.exec(fromHeader || "");
  const name = match ? cleanText(match[1], 40).trim() : "";
  return /^[\p{L}\p{N} .&'-]{1,40}$/u.test(name) ? name : "";
}
// Parsed messages hold only what matching needs: never the body.
function cdParseMessage(raw) {
  const mail = gmailApiMessageToMail(raw);
  if (!mail) return null;
  const headers = Array.isArray(raw?.payload?.headers) ? raw.payload.headers : [];
  const header = (name) => headers.find((h) => typeof h?.name === "string" && h.name.toLowerCase() === name);
  const auth = header("authentication-results");
  return {
    id: mail.id,
    fromEmail: mail.fromEmail,
    fromName: cdDisplayName(header("from")?.value),
    receivedAt: mail.receivedAt,
    authResults: typeof auth?.value === "string" ? auth.value.slice(0, 4e3) : "",
    codes: extractCodes(mail.subject, mail.bodyText)
  };
}
// Registrable domain of the From address, but only if Gmail verified it:
// DMARC pass for exactly that From domain, or a passing DKIM signature from
// the same registrable domain. Gmail adds its own Authentication-Results at
// the top, so only the first one, stamped mx.google.com, is trusted.
function cdVerifiedSenderDomain(authResults, fromEmail) {
  if (!fromEmail || typeof authResults !== "string") return null;
  const text = authResults.replace(/\s+/g, " ").trim();
  if (!/^mx\.google\.com;/i.test(text)) return null;
  const fromDomain = fromEmail.split("@")[1];
  const fromReg = cdRegistrable(fromDomain);
  if (!fromReg) return null;
  for (const match of text.matchAll(/(?:^|;)\s*dmarc=pass\b[^;]*?\bheader\.from=([a-z0-9.-]+)/gi)) {
    if (match[1].toLowerCase() === fromDomain) return fromReg;
  }
  for (const match of text.matchAll(/(?:^|;)\s*dkim=pass\b([^;]*)/gi)) {
    const detail = match[1] ?? "";
    const signer = detail.match(/\bheader\.i=[^\s@;]*@([a-z0-9.-]+)/i)?.[1] ?? detail.match(/\bheader\.d=([a-z0-9.-]+)/i)?.[1];
    if (signer && cdRegistrable(signer) === fromReg) return fromReg;
  }
  return null;
}
// Short company name for the bubble ("Microsoft code"). Known names first,
// then a short sender name such as "Meta", then the capitalised domain.
var CD_COMPANY_NAMES = {
  "microsoft.com": "Microsoft", "live.com": "Microsoft", "microsoftonline.com": "Microsoft", "office.com": "Microsoft",
  "microsoft365.com": "Microsoft", "outlook.com": "Microsoft", "xbox.com": "Xbox", "skype.com": "Skype", "bing.com": "Microsoft",
  "meta.com": "Meta", "facebookmail.com": "Facebook", "facebook.com": "Facebook", "instagram.com": "Instagram",
  "threads.net": "Threads", "threads.com": "Threads", "muse.ai": "Muse", "github.com": "GitHub", "gitlab.com": "GitLab",
  "npmjs.com": "npm", "linkedin.com": "LinkedIn", "paypal.com": "PayPal", "openai.com": "OpenAI", "chatgpt.com": "ChatGPT",
  "claude.ai": "Claude", "youtube.com": "YouTube", "tiktok.com": "TikTok", "x.com": "X", "twitter.com": "X", "ebay.com": "eBay",
  "icloud.com": "Apple", "apple.com": "Apple", "google.com": "Google", "doordash.com": "DoorDash", "americanexpress.com": "American Express",
  "bankofamerica.com": "Bank of America", "wellsfargo.com": "Wells Fargo", "capitalone.com": "Capital One", "homedepot.com": "Home Depot",
  "bestbuy.com": "Best Buy", "digitalocean.com": "DigitalOcean", "hubspot.com": "HubSpot", "clickup.com": "ClickUp",
  "steampowered.com": "Steam", "steamcommunity.com": "Steam", "epicgames.com": "Epic Games", "playstation.com": "PlayStation",
  "khanacademy.org": "Khan Academy", "nytimes.com": "New York Times", "wsj.com": "WSJ", "aa.com": "American Airlines",
  "disneyplus.com": "Disney+", "max.com": "Max", "ea.com": "EA", "aol.com": "AOL", "proton.me": "Proton", "docusign.com": "DocuSign",
  "atlassian.com": "Atlassian", "atlassian.net": "Atlassian", "bitbucket.org": "Bitbucket", "zoom.us": "Zoom", "wise.com": "Wise",
  "eufy.com": "eufy", "eufylife.com": "eufy"
};
function cdCompanyName(reg, displayName) {
  if (CD_COMPANY_NAMES[reg]) return CD_COMPANY_NAMES[reg];
  const name = (displayName || "").trim();
  if (name && name.length <= 20 && name.split(/\s+/).length <= 2 && !/\b(team|account|security|no-?reply|notifications?|support|alerts?|info|mailer|service)\b/i.test(name)) return name;
  const label = reg.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function cdPickCode(candidates, site, now) {
  const allowed = cdAllowedSenders(site.reg);
  let sawUnverified = false;
  const usable = [];
  for (const mail of candidates) {
    const from = normalizeEmail(mail.fromEmail);
    if (!from) continue;
    const claimedReg = cdRegistrable(from.split("@")[1]);
    if (!claimedReg || !allowed.has(claimedReg)) continue;
    if (mail.receivedAt === null || mail.receivedAt > now + CD_FUTURE_SKEW_MS || now - mail.receivedAt > CD_FRESH_MS) continue;
    const verifiedReg = cdVerifiedSenderDomain(mail.authResults, from);
    if (!verifiedReg || !allowed.has(verifiedReg)) {
      sawUnverified = true;
      continue;
    }
    if (mail.codes.length !== 1) continue;
    usable.push({ ...mail, verifiedReg });
  }
  if (usable.length === 0) return { ok: false, reason: sawUnverified ? "sender_unverified" : "waiting" };
  usable.sort((a, b) => b.receivedAt - a.receivedAt);
  const newest = usable[0];
  return {
    ok: true,
    code: newest.codes[0],
    receivedAt: newest.receivedAt,
    messageId: newest.id,
    serviceName: cdCompanyName(newest.verifiedReg, newest.fromName)
  };
}

// ---------- Hybrid mode: built-in sites + sites you turn on ----------
function cdFromExtensionPage(sender, pages) {
  return sender?.id === chrome.runtime.id && typeof sender.url === "string" && pages.some((page) => sender.url === chrome.runtime.getURL(page));
}
function cdRegFromPattern(pattern) {
  const match = /^https:\/\/\*\.([a-z0-9.-]+)\/\*$/.exec(pattern);
  return match ? cdRegistrable(match[1]) : null;
}
function cdBuiltInRegs() {
  const regs = /* @__PURE__ */ new Set();
  for (const block of chrome.runtime.getManifest().content_scripts || []) {
    for (const pattern of block.matches || []) {
      const reg = cdRegFromPattern(pattern);
      if (reg) regs.add(reg);
    }
  }
  return regs;
}
async function cdEnabledRegs() {
  const { origins = [] } = await chrome.permissions.getAll();
  const builtIn = cdBuiltInRegs();
  const regs = /* @__PURE__ */ new Set();
  for (const pattern of origins) {
    const reg = cdRegFromPattern(pattern);
    if (reg && !builtIn.has(reg)) regs.add(reg);
  }
  return [...regs];
}
async function cdTabStatus(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: true, state: "not_web" };
  }
  if (parsed.protocol !== "https:") return { ok: true, state: "not_https" };
  if (parsed.hostname === "mail.google.com") return { ok: true, state: "gmail" };
  const reg = cdRegistrable(parsed.hostname);
  if (!reg) return { ok: true, state: "not_web" };
  if (!cdHostAllowed(parsed.hostname, reg)) return { ok: true, state: "user_content", reg };
  const gmail = Boolean(await cdToken(false));
  if (cdBuiltInRegs().has(reg)) return { ok: true, state: "built_in", reg, gmail };
  const enabled = (await cdEnabledRegs()).includes(reg);
  return { ok: true, state: enabled ? "enabled" : "off", reg, pattern: `https://*.${reg}/*`, gmail };
}
// Keep one registered content script per site you turned on, matching the
// permissions Chrome currently grants (you can also remove them in Chrome).
async function cdSyncSiteScripts() {
  const wanted = new Set(await cdEnabledRegs());
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const ours = existing.filter((script) => script.id.startsWith("cd-site-"));
  const stale = ours.filter((script) => !wanted.has(script.id.slice(8))).map((script) => script.id);
  if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
  const have = new Set(ours.map((script) => script.id.slice(8)));
  const add = [...wanted].filter((reg) => !have.has(reg)).map((reg) => ({
    id: `cd-site-${reg}`,
    matches: [`https://*.${reg}/*`],
    js: ["code-bubble.js"],
    allFrames: true,
    runAt: "document_idle",
    persistAcrossSessions: true
  }));
  if (add.length) await chrome.scripting.registerContentScripts(add);
}
async function cdInjectIntoTab(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["code-bubble.js"] });
  } catch {
  }
}
// The toolbar popup can close while Chrome shows its permission prompt, so the
// newly allowed site's open tabs get the bubble from here.
chrome.permissions.onAdded.addListener((added) => void (async () => {
  await cdSyncSiteScripts();
  for (const pattern of added.origins || []) {
    if (!cdRegFromPattern(pattern)) continue;
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const openTab of tabs) if (typeof openTab.id === "number") await cdInjectIntoTab(openTab.id);
  }
})().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => void cdSyncSiteScripts().catch(() => {}));

// On any https site, Chrome itself checks for a code-like box (no site access
// needed) and CodeDrop's toolbar icon gets a dot. Clicking it offers
// "Turn on CodeDrop for this site".
var CD_CODE_BOX_SELECTORS = [
  "input[autocomplete='one-time-code']",
  "input[maxlength='1'][inputmode='numeric']",
  "input[maxlength='6'][inputmode='numeric']",
  "input[name*='otp']",
  "input[id*='otp']",
  "input[name*='verification']",
  "input[id*='verification']",
  "input[aria-label*='code']",
  "input[aria-label*='Code']",
  "input[placeholder*='code']",
  "input[placeholder*='Code']"
];
async function cdHighlightIcon() {
  const blob = await (await fetch(chrome.runtime.getURL("icons/icon48.png"))).blob();
  const bitmap = await createImageBitmap(blob);
  const imageData = {};
  for (const size of [16, 32]) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, size, size);
    const r = size * 0.24;
    ctx.beginPath();
    ctx.arc(size - r, size - r, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ff9f0a";
    ctx.fill();
    ctx.lineWidth = Math.max(1, size / 16);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}
async function cdInstallPageRules() {
  const imageData = await cdHighlightIcon();
  await chrome.declarativeContent.onPageChanged.removeRules(void 0);
  await chrome.declarativeContent.onPageChanged.addRules([{
    conditions: CD_CODE_BOX_SELECTORS.map((selector) => new chrome.declarativeContent.PageStateMatcher({
      pageUrl: { schemes: ["https"] },
      css: [selector]
    })),
    actions: [new chrome.declarativeContent.SetIcon({ imageData })]
  }]);
}
async function cdSetup() {
  await cdSyncSiteScripts().catch(() => {});
  await cdInstallPageRules().catch((error) => console.warn("CodeDrop: icon rule failed", error));
}
chrome.runtime.onInstalled.addListener(() => void cdSetup());
chrome.runtime.onStartup.addListener(() => void cdSetup());
