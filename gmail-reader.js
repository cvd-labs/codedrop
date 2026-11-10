"use strict";
(() => {
  // src/lib/plain.ts
  function cleanText(value, max) {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max);
  }

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

  // src/lib/time.ts
  function parseMailboxTime(raw, now) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 80) return null;
    const text = trimmed.toLowerCase();
    if (text === "now" || text === "just now") return now;
    const minutes = text.match(/^(\d+)\s*min(?:ute)?s?\s*ago$/);
    if (minutes) return now - Number(minutes[1]) * 6e4;
    const seconds = text.match(/^(\d+)\s*sec(?:ond)?s?\s*ago$/);
    if (seconds) return now - Number(seconds[1]) * 1e3;
    const hours = text.match(/^(\d+)\s*hours?\s*ago$/);
    if (hours) return now - Number(hours[1]) * 36e5;
    if (text === "yesterday" || /^\d+\s*days?\s*ago$/.test(text)) return now - 36 * 36e5;
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return null;
    return parsed;
  }

  // src/lib/gmail-dom.ts
  var ROW_LIMIT = 25;
  function readGmailDocument(doc, now, href) {
    let hostname = "";
    try {
      hostname = new URL(href).hostname;
    } catch {
      return { ok: false, reason: "not_gmail_document" };
    }
    if (hostname !== "mail.google.com") return { ok: false, reason: "not_gmail_document" };
    if (looksSignedOut(doc, href)) return { ok: false, reason: "signed_out" };
    const scope = doc.querySelector("[role='main']") ?? doc.body;
    if (!scope) return { ok: false, reason: "nothing_visible" };
    const open = readOpenMessage(scope, now);
    if (open) return { ok: true, messages: [open] };
    const rows = [...scope.querySelectorAll("tr.zA")];
    if (rows.length > ROW_LIMIT) return { ok: false, reason: "gmail_inbox_too_large" };
    const messages = rows.map((row, index) => readRow(row, index, now)).filter((message) => message !== null);
    if (messages.length === 0) return { ok: false, reason: "nothing_visible" };
    return { ok: true, messages };
  }
  function looksSignedOut(doc, href) {
    if (href.includes("accounts.google.com") || href.includes("ServiceLogin")) return true;
    return Boolean(doc.querySelector("#identifierId, form[action*='ServiceLogin']"));
  }
  function readOpenMessage(scope, now) {
    const bodyEl = [...scope.querySelectorAll("div.a3s")].find(
      (element) => element.getAttribute("contenteditable") !== "true"
    );
    if (!bodyEl) return null;
    const senderEl = scope.querySelector("span.gD[email]");
    const fromEmail = emailAttr(senderEl?.getAttribute("email"));
    const fromDisplay = cleanText(senderEl?.getAttribute("name") || senderEl?.textContent || "", 120);
    const subject = cleanText(scope.querySelector("h2.hP")?.textContent ?? "", 300);
    const header = scope.querySelector(".gE") ?? scope.querySelector(".ha");
    const toEmails = [];
    if (header) {
      for (const element of header.querySelectorAll("[email]")) {
        if (element === senderEl) continue;
        const email = emailAttr(element.getAttribute("email"));
        if (email && email !== fromEmail && !toEmails.includes(email)) toEmails.push(email);
      }
    }
    const timeEl = scope.querySelector("span.g3[title]");
    const receivedAt = parseMailboxTime(timeEl?.getAttribute("title") || timeEl?.textContent, now);
    const bodyText = cleanText(bodyEl.textContent ?? "", 2e4);
    if (!subject && !bodyText) return null;
    return {
      id: `open:${fromEmail ?? "unknown"}:${receivedAt ?? "na"}`,
      fromEmail,
      fromDisplay,
      toEmails: toEmails.slice(0, 10),
      subject,
      bodyText,
      receivedAt,
      sourceLabel: "gmail_dom"
    };
  }
  function readRow(row, index, now) {
    const addresses = [
      ...new Set(
        [...row.querySelectorAll("[email]")].map((element) => emailAttr(element.getAttribute("email"))).filter((email) => email !== null)
      )
    ];
    const fromEmail = addresses.length === 1 ? addresses[0] : null;
    const displayEl = row.querySelector("[email]");
    const fromDisplay = cleanText(displayEl?.getAttribute("name") || displayEl?.textContent || "", 120);
    const subject = cleanText(row.querySelector(".bog")?.textContent ?? "", 300);
    const snippet = cleanText(row.querySelector(".y2")?.textContent ?? "", 2e4);
    if (!subject && !snippet) return null;
    const timeEl = row.querySelector(".xW [title], span[title]");
    const receivedAt = parseMailboxTime(timeEl?.getAttribute("title") || null, now);
    return {
      id: `row:${index}:${fromEmail ?? "unknown"}`,
      fromEmail,
      fromDisplay,
      toEmails: [],
      subject,
      bodyText: snippet,
      receivedAt,
      sourceLabel: "gmail_dom"
    };
  }
  function emailAttr(value) {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.includes(" ") || trimmed.includes(",")) return null;
    return normalizeEmail(trimmed);
  }

  // src/inject/gmail-reader.ts
  globalThis.__kamalReadGmail = () => readGmailDocument(document, Date.now(), location.href);
})();
