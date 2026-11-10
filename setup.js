"use strict";
const PLACEHOLDER = "PASTE_YOUR_CLIENT_ID";
const $ = (id) => document.getElementById(id);

function clientIdReady() {
  const id = chrome.runtime.getManifest().oauth2?.client_id || "";
  return id.endsWith(".apps.googleusercontent.com") && !id.startsWith(PLACEHOLDER);
}
async function getToken(interactive) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    return typeof result === "string" ? result : result?.token || null;
  } catch (error) {
    if (interactive) console.warn("CodeDrop: Google sign-in failed", error?.message || error);
    return null;
  }
}
async function gmailAddress(token) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "omit"
  });
  if (!response.ok) return null;
  const body = await response.json();
  return typeof body.emailAddress === "string" ? body.emailAddress : null;
}
function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = kind || "";
}
async function refresh() {
  $("ext-id").textContent = chrome.runtime.id;
  if (!clientIdReady()) {
    $("needs-client").classList.remove("hidden");
    setStatus("Not set up yet: Google Client ID missing.", "warn");
    $("connect").classList.add("hidden");
    $("disconnect").classList.add("hidden");
    return;
  }
  const token = await getToken(false);
  const email = token ? await gmailAddress(token) : null;
  if (email) {
    setStatus(`Connected to ${email}`, "ok");
    $("connect").classList.add("hidden");
    $("disconnect").classList.remove("hidden");
  } else {
    setStatus("Not connected.", "warn");
    $("connect").classList.remove("hidden");
    $("disconnect").classList.add("hidden");
  }
}
async function loadSites() {
  let response = null;
  try {
    response = await chrome.runtime.sendMessage({ type: "CD_SITES" });
  } catch {}
  const builtIn = response?.builtIn || [];
  $("builtin-count").textContent = String(builtIn.length);
  $("builtin").textContent = builtIn.join(", ");
  const list = $("enabled");
  list.replaceChildren();
  for (const reg of response?.enabled || []) {
    const item = document.createElement("li");
    item.append(`${reg} `);
    const remove = document.createElement("button");
    remove.textContent = "Turn off";
    remove.addEventListener("click", async () => {
      try {
        await chrome.permissions.remove({ origins: [`https://*.${reg}/*`] });
      } catch {}
      try {
        await chrome.runtime.sendMessage({ type: "CD_SITE_ENABLED" });
      } catch {}
      await loadSites();
    });
    item.append(remove);
    list.append(item);
  }
  if (!list.children.length) {
    const item = document.createElement("li");
    item.className = "meta";
    item.textContent = "None yet.";
    list.append(item);
  }
  const body = $("aliases");
  body.replaceChildren();
  for (const [site, senders] of Object.entries(response?.aliases || {})) {
    const row = document.createElement("tr");
    for (const value of [site, senders.join(", ")]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
}
$("connect").addEventListener("click", async () => {
  setStatus("Opening Google sign-in…");
  const token = await getToken(true);
  if (!token) setStatus("Google sign-in didn't finish. Try again.", "warn");
  await refresh();
});
$("disconnect").addEventListener("click", async () => {
  const token = await getToken(false);
  if (token) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        credentials: "omit"
      });
    } catch {}
    try {
      await chrome.identity.removeCachedAuthToken({ token });
    } catch {}
  }
  try {
    await chrome.identity.clearAllCachedAuthTokens();
  } catch {}
  await refresh();
});
void refresh();
void loadSites();
