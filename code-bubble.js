"use strict";
// CodeDrop content script. Runs only on the allowlisted login sites listed in
// manifest.json. When the page shows a verification-code box, it asks the
// background worker (which reads Gmail) for a fresh code and offers it in a
// small bubble next to the box. Nothing is typed until you click Fill.
(() => {
  // Runs in every frame of an allowlisted site: some login forms live in an iframe.
  // Real pages: https only. globalThis.__codeDropTestPage is set only by the
  // local test pages in tests/pages (a website cannot set it: content scripts
  // run in their own isolated world).
  if (location.protocol !== "https:" && !globalThis.__codeDropTestPage) return;
  if (globalThis.__codeDropLoaded) return;
  globalThis.__codeDropLoaded = true;

  const POLL_MS = 3000;
  const WATCH_MS = 3 * 60 * 1000;
  const HOST_TAG = "codedrop-bubble";

  let target = null;
  let watchStarted = 0;
  let pollTimer = null;
  let polling = false;
  let done = false;
  let dismissed = false;
  let offer = null;
  let lastHref = location.href;
  let host = null;
  let ui = null;

  // ---------- finding the code box ----------
  function hasToken(value, token) {
    return (value || "").toLowerCase().split(/\s+/).includes(token);
  }
  function isEligible(el) {
    if (el.disabled || el.readOnly) return false;
    if (el.closest(HOST_TAG)) return false;
    const blocked = new Set(["hidden", "password", "submit", "button", "checkbox", "radio", "file", "email", "search", "url", "date", "range", "color"]);
    if (blocked.has(el.type)) return false;
    if (el.getAttribute("aria-hidden") === "true" || el.closest("[hidden], [aria-hidden='true']")) return false;
    // Many code widgets keep the real input invisible (opacity 0, 1px wide) and
    // draw six boxes on top, so size and opacity are not checked here.
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (el.getClientRects().length === 0) return false;
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (/\b(current-password|new-password|username|email|tel-national|postal-code|cc-)/.test(ac)) return false;
    return true;
  }
  function labelText(el) {
    const bits = [el.name, el.id, el.title, el.getAttribute("aria-label") || "", el.getAttribute("placeholder") || "", el.getAttribute("autocomplete") || ""];
    const root = el.getRootNode();
    for (const attr of ["aria-labelledby", "aria-describedby"]) {
      for (const id of (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean)) {
        const ref = root.getElementById ? root.getElementById(id) : document.getElementById(id);
        if (ref?.textContent) bits.push(ref.textContent.slice(0, 200));
      }
    }
    for (const label of el.labels || []) {
      if (label.textContent) bits.push(label.textContent.slice(0, 200));
    }
    return bits.join(" ").toLowerCase();
  }
  // A box labelled only "code" is a weak match: CodeDrop stays silent there
  // unless a matching code actually arrives.
  const STRONG_LABEL = /\b(otp|one-time|one time|verification|verify|passcode|security code|login code|sign-in code|auth code|authentication code)\b/;
  function isLabeledCode(el) {
    const text = labelText(el);
    if (/\b(zip|postal|country|area|promo|coupon|discount|gift|barcode|referral|invite)\b/.test(text)) return false;
    return /\b(otp|one-time|one time|verification|verify|passcode|security code|login code|auth code|authentication code|code)\b/.test(text);
  }
  // 4 to 8 small boxes that belong together (GitHub uses 8, most sites 6).
  // Sites often wrap each box in its own element(s), so look up to 5 levels for
  // containers holding 4-8 similar boxes, and keep the largest group (a site
  // may split 8 boxes into two groups of 4).
  function findSplit(eligible) {
    const boxes = eligible.filter((el) => {
      if (!["text", "tel", "number", ""].includes(el.type)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return false;
      return el.maxLength === 1 || rect.width <= 90;
    });
    if (boxes.length < 4) return null;
    const groups = new Map();
    for (const el of boxes) {
      let node = el.parentElement;
      for (let level = 0; node && level < 5; level++, node = node.parentElement) {
        if (!groups.has(node)) groups.set(node, new Set());
        groups.get(node).add(el);
      }
    }
    const candidates = [];
    for (const set of groups.values()) {
      if (set.size < 4 || set.size > 8) continue;
      if (candidates.some((g) => g.size === set.size && [...g].every((el) => set.has(el)))) continue;
      const widths = [...set].map((el) => el.getBoundingClientRect().width);
      if (Math.max(...widths) > Math.min(...widths) * 1.6) continue;
      candidates.push(set);
    }
    const isInside = (small, big) => small !== big && small.size < big.size && [...small].every((el) => big.has(el));
    const largest = candidates.filter((set) => !candidates.some((other) => isInside(set, other)));
    if (largest.length !== 1) return null;
    return [...largest[0]].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }
  // All inputs, including ones inside open shadow roots.
  // Walking every shadow root is costly on busy pages, so the deep walk runs at
  // most every 3 seconds, or right after you focus a field.
  let lastDeep = 0;
  function allInputs() {
    const out = [];
    const deep = Date.now() - lastDeep > 3000;
    if (deep) lastDeep = Date.now();
    const visit = (root, depth) => {
      out.push(...root.querySelectorAll("input"));
      if (!deep || depth > 4) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.shadowRoot && node.tagName.toLowerCase() !== HOST_TAG) visit(node.shadowRoot, depth + 1);
      }
    };
    visit(document, 0);
    return out;
  }
  let lastSeenInputs = [];
  function findTarget() {
    lastSeenInputs = allInputs().slice(0, 300);
    const eligible = lastSeenInputs.filter(isEligible);
    const dedicated = eligible.filter((el) => hasToken(el.getAttribute("autocomplete"), "one-time-code") && el.maxLength !== 1);
    const split = findSplit(eligible);
    // Six boxes win when the "one-time-code" box is just the first of them
    // (some sites, such as the Microsoft sign-in, mark only box 1 that way).
    if (split && dedicated.every((el) => split.includes(el))) return { kind: "split", els: split, strong: true };
    if (dedicated.length === 1) return { kind: "single", els: dedicated, strong: true };
    if (dedicated.length > 1) return null;
    if (split) return { kind: "split", els: split, strong: true };
    const labeled = eligible.filter(isLabeledCode);
    if (labeled.length === 1) return { kind: "single", els: labeled, strong: STRONG_LABEL.test(labelText(labeled[0])) };
    return null;
  }
  function sameTarget(a, b) {
    return !!a && !!b && a.els.length === b.els.length && a.els.every((el, i) => el === b.els[i]);
  }

  // ---------- filling ----------
  function setNativeValue(el, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function currentValue() {
    return target.els.map((el) => el.value).join("");
  }
  async function fillCode(code) {
    if (!/^\d{4,8}$/.test(code) || !target) return false;
    if (target.kind === "split" && target.els.length !== code.length) return false;
    if (target.kind === "single") {
      const max = target.els[0].maxLength;
      if (max > 0 && max < code.length) return false;
      target.els[0].focus();
      setNativeValue(target.els[0], code);
      await sleep(60);
      return target.els[0].value.replace(/\D/g, "") === code;
    }
    // Split boxes: many sites spread a pasted code across the boxes themselves.
    const first = target.els[0];
    first.focus();
    try {
      const data = new DataTransfer();
      data.setData("text/plain", code);
      first.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    } catch {}
    await sleep(80);
    if (currentValue() === code) return true;
    for (let i = 0; i < target.els.length; i++) {
      const el = target.els[i];
      const key = code[i];
      el.focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      setNativeValue(el, key);
      el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      await sleep(20);
    }
    await sleep(80);
    return currentValue() === code;
  }

  // ---------- bubble ----------
  const CSS_TEXT = `
    :host { all: initial; }
    .card { position: fixed; z-index: 2147483647; min-width: 240px; max-width: 320px; box-sizing: border-box;
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1d1d1f;
      background: #fff; border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px 12px;
      box-shadow: 0 8px 28px rgba(0,0,0,.18); display: flex; align-items: center; gap: 10px; }
    .text { flex: 1; min-width: 0; }
    .title { font-weight: 600; }
    .meta { color: #6e6e73; font-size: 12px; }
    .code { font: 600 20px/1.2 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 2px; margin-top: 2px; }
    button { font: 600 13px -apple-system, BlinkMacSystemFont, sans-serif; border: 0; border-radius: 8px;
      padding: 7px 12px; cursor: pointer; background: #e8e8ed; color: #1d1d1f; }
    button.primary { background: #0071e3; color: #fff; }
    button.close { background: transparent; color: #6e6e73; padding: 4px 6px; font-size: 16px; line-height: 1; }
    button:focus-visible { outline: 2px solid #0071e3; outline-offset: 2px; }
    .hidden { display: none; }
    @media (prefers-color-scheme: dark) {
      .card { background: #2c2c2e; color: #f5f5f7; border-color: rgba(255,255,255,.14); }
      .meta, button.close { color: #a1a1a6; }
      button { background: #3a3a3c; color: #f5f5f7; }
      button.primary { background: #0a84ff; }
    }`;
  function ensureUi() {
    if (host && host.isConnected) return;
    host = document.createElement(HOST_TAG);
    // Inline styles beat page CSS. As a manual popover the bubble joins the top
    // layer, so it stays visible above login dialogs that use <dialog> or popovers.
    host.style.cssText = "position:fixed;inset:auto;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;z-index:2147483647";
    if ("popover" in HTMLElement.prototype) host.setAttribute("popover", "manual");
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS_TEXT;
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "CodeDrop");
    const text = document.createElement("div");
    text.className = "text";
    const title = document.createElement("div");
    title.className = "title";
    const code = document.createElement("div");
    code.className = "code";
    const meta = document.createElement("div");
    meta.className = "meta";
    text.append(title, code, meta);
    const fill = document.createElement("button");
    fill.className = "primary";
    fill.textContent = "Fill";
    const copy = document.createElement("button");
    copy.textContent = "Copy";
    const action = document.createElement("button");
    action.className = "primary";
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Dismiss");
    card.append(text, fill, copy, action, close);
    root.append(style, card);
    document.documentElement.append(host);
    ui = { card, title, code, meta, fill, copy, action, close };

    fill.addEventListener("click", async (event) => {
      if (!event.isTrusted || !offer) return;
      const ok = await fillCode(offer.code);
      if (ok) {
        done = true;
        stopPolling();
        render({ state: "filled" });
        setTimeout(hide, 1800);
      } else {
        render({ state: "fill_failed" });
      }
    });
    copy.addEventListener("click", async (event) => {
      if (!event.isTrusted || !offer) return;
      try {
        await navigator.clipboard.writeText(offer.code);
        ui.meta.textContent = "Copied. Paste it into the first box.";
      } catch {
        ui.meta.textContent = "Couldn't copy. Type the code shown above.";
      }
    });
    action.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      void ask("CD_OPEN_SETUP");
    });
    close.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      dismissed = true;
      stopPolling();
      hide();
    });
  }
  function ageText(receivedAt) {
    const minutes = Math.floor((Date.now() - receivedAt) / 60000);
    return minutes < 1 ? "just now" : `${minutes} min ago`;
  }
  // A code sent well before this code box appeared may belong to an earlier
  // request; say so while CodeDrop keeps checking for a newer email.
  function offerMeta() {
    const age = `From Gmail · ${ageText(offer.receivedAt)}`;
    const earlier = offer.receivedAt < watchStarted - 30000 && Date.now() - watchStarted < WATCH_MS;
    return earlier ? `${age} · checking for a newer one` : age;
  }
  function show(el, visible) {
    el.classList.toggle("hidden", !visible);
  }
  function render(view) {
    ensureUi();
    const service = view.serviceName || offer?.serviceName || "this site";
    show(ui.code, false);
    show(ui.fill, false);
    show(ui.copy, false);
    show(ui.action, false);
    if (view.state === "code") {
      ui.title.textContent = `${service} code`;
      ui.code.textContent = offer.code;
      ui.meta.textContent = offerMeta();
      show(ui.code, true);
      show(ui.fill, true);
      show(ui.copy, true);
    } else if (view.state === "waiting") {
      ui.title.textContent = `Waiting for your ${service} code…`;
      ui.meta.textContent = "CodeDrop is watching Gmail. It appears here when the email arrives.";
    } else if (view.state === "setup") {
      ui.title.textContent = "Connect Gmail to fill codes";
      ui.meta.textContent = `CodeDrop can offer your ${service} code here once Gmail is connected.`;
      ui.action.textContent = "Connect";
      show(ui.action, true);
    } else if (view.state === "unverified") {
      ui.title.textContent = `${service} email couldn't be verified`;
      ui.meta.textContent = "Gmail didn't confirm it came from the real sender, so CodeDrop won't use it.";
    } else if (view.state === "filled") {
      ui.title.textContent = "Code filled";
      ui.meta.textContent = "Check it, then continue on the page.";
    } else if (view.state === "fill_failed") {
      ui.title.textContent = "This box didn't accept the code";
      ui.code.textContent = offer.code;
      ui.meta.textContent = "Use Copy, then paste it into the first box.";
      show(ui.code, true);
      show(ui.copy, true);
    }
    showHost();
    position();
  }
  function showHost() {
    host.style.display = "";
    if (host.hasAttribute("popover")) {
      try {
        if (host.matches(":popover-open")) host.hidePopover();
        host.showPopover();
      } catch {}
    }
  }
  function hide() {
    if (!host) return;
    host.style.display = "none";
    if (host.hasAttribute("popover")) {
      try {
        if (host.matches(":popover-open")) host.hidePopover();
      } catch {}
    }
  }
  // A hidden 1px input sits inside the drawn boxes; anchor to the nearest
  // ancestor that is big enough to be the visible box row.
  function anchorRects() {
    const rects = target.els.map((el) => el.getBoundingClientRect());
    if (target.kind !== "single") return rects;
    const r = rects[0];
    if (r.width >= 40 && r.height >= 12) return rects;
    let node = target.els[0].parentElement;
    for (let i = 0; node && i < 6; i++, node = node.parentElement) {
      const box = node.getBoundingClientRect();
      if (box.width >= 120 && box.height >= 24) return [box];
    }
    return rects;
  }
  function position() {
    if (!ui || !target || !host || host.style.display === "none") return;
    const rects = anchorRects();
    const left = Math.min(...rects.map((r) => r.left));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const top = Math.min(...rects.map((r) => r.top));
    const card = ui.card.getBoundingClientRect();
    const width = card.width || 280;
    const height = card.height || 64;
    let y = bottom + 8;
    if (y + height > innerHeight - 8) y = Math.max(8, top - height - 8);
    const x = Math.max(8, Math.min(left, innerWidth - width - 8));
    ui.card.style.left = `${x}px`;
    ui.card.style.top = `${y}px`;
  }

  // ---------- talking to the background worker ----------
  async function ask(type) {
    try {
      return await chrome.runtime.sendMessage({ type });
    } catch {
      return null;
    }
  }
  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }
  function startWatching() {
    if (done || dismissed || pollTimer || polling) return;
    watchStarted = Date.now();
    void tick();
  }
  async function tick() {
    pollTimer = null;
    if (done || dismissed || !target || !target.els[0].isConnected) return;
    if (Date.now() - watchStarted > WATCH_MS) {
      if (!offer) hide();
      return;
    }
    polling = true;
    const res = await ask("CD_CHECK");
    polling = false;
    reportReason(res?.ok ? "code found" : res?.reason || "no answer from CodeDrop (reload the page after reloading the extension)");
    if (done || dismissed || !target) return;
    if (res?.ok && /^\d{4,8}$/.test(res.code)) {
      if (!offer || offer.code !== res.code) {
        offer = { code: res.code, receivedAt: res.receivedAt, serviceName: res.serviceName };
        render({ state: "code" });
      } else {
        // Same code in a newer email (sites often resend the same code): show the newer time.
        if (typeof res.receivedAt === "number" && res.receivedAt > offer.receivedAt) offer.receivedAt = res.receivedAt;
        if (ui.code.textContent === offer.code) ui.meta.textContent = offerMeta();
      }
    } else if (!offer && target.strong) {
      if (res?.reason === "needs_setup") render({ state: "setup", serviceName: res.serviceName || res.siteName });
      else if (res?.reason === "sender_unverified") render({ state: "unverified", serviceName: res.serviceName || res.siteName });
      else if (res?.reason === "unsupported_site") return;
      else render({ state: "waiting", serviceName: res?.serviceName || res?.siteName });
    }
    if (res?.reason === "unsupported_site") return;
    pollTimer = setTimeout(tick, POLL_MS);
  }

  // ---------- watching the page ----------
  // Diagnostics in the page's DevTools console (filter: CodeDrop). Logged only
  // when something changes. Codes are never logged.
  let lastReport = "";
  function describeInput(el) {
    const r = el.getBoundingClientRect();
    return {
      type: el.type,
      autocomplete: el.getAttribute("autocomplete") || "",
      label: labelText(el).replace(/\s+/g, " ").trim().slice(0, 80),
      maxLength: el.maxLength,
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      eligible: isEligible(el)
    };
  }
  function report(found) {
    const key = found ? `${found.kind}:${found.els.length}` : `none:${lastSeenInputs.length}`;
    if (key === lastReport) return;
    lastReport = key;
    const where = `${location.origin} (${window.top === window ? "top page" : "iframe"})`;
    if (found) console.info(`[CodeDrop] code box found on ${where}: ${found.kind === "split" ? `${found.els.length} separate boxes` : "one box"}`, found.els.map(describeInput));
    else console.info(`[CodeDrop] no code box yet on ${where}; ${lastSeenInputs.length} input(s) seen`, lastSeenInputs.slice(0, 12).map(describeInput));
  }
  let lastReason = "";
  function reportReason(reason) {
    if (reason === lastReason) return;
    lastReason = reason;
    console.info(`[CodeDrop] Gmail check: ${reason}`);
  }
  function scan() {
    if (location.href !== lastHref) {
      lastHref = location.href;
      done = false;
      dismissed = false;
      offer = null;
    }
    const found = findTarget();
    report(found);
    if (found) {
      if (!sameTarget(found, target)) {
        target = found;
        stopPolling();
        startWatching();
      }
      position();
    } else if (target && !target.els[0].isConnected) {
      target = null;
      offer = null;
      stopPolling();
      hide();
    }
  }
  let scanQueued = false;
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => {
      scanQueued = false;
      scan();
    }, 400);
  }
  new MutationObserver(queueScan).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("focusin", () => {
    lastDeep = 0;
    queueScan();
  }, true);
  addEventListener("scroll", position, true);
  addEventListener("resize", position);
  scan();

})();
