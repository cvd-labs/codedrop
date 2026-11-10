"use strict";
const $ = (id) => document.getElementById(id);
let tab = null;
let status = null;

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}
async function load() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    status = await chrome.runtime.sendMessage({ type: "CD_TAB_STATUS", url: tab?.url || "" });
  } catch {
    status = null;
  }
  render();
}
function render() {
  show("turn-on", false);
  show("turn-off", false);
  const state = status?.state;
  if (state === "built_in") {
    $("headline").textContent = `On for ${status.reg}`;
    $("detail").textContent = "Built-in site. When a code box appears, CodeDrop offers the code from Gmail.";
  } else if (state === "enabled") {
    $("headline").textContent = `On for ${status.reg}`;
    $("detail").textContent = "You turned CodeDrop on for this site.";
    show("turn-off", true);
  } else if (state === "off") {
    $("headline").textContent = `Turn on CodeDrop for ${status.reg}?`;
    $("detail").textContent = "CodeDrop will watch for code boxes on this site and offer codes from Gmail. Chrome will ask you to allow it.";
    $("turn-on").textContent = "Turn on";
    show("turn-on", true);
  } else if (state === "user_content") {
    $("headline").textContent = "Not available on this page";
    $("detail").textContent = `This looks like a page someone published on ${status.reg}, not ${status.reg}'s own sign-in, so CodeDrop stays off to protect your codes.`;
  } else if (state === "gmail") {
    $("headline").textContent = "This is Gmail";
    $("detail").textContent = "Open the site that's asking for a code. CodeDrop reads Gmail in the background.";
  } else if (state === "not_https") {
    $("headline").textContent = "Not available on this page";
    $("detail").textContent = "CodeDrop only works on secure (https) websites.";
  } else {
    $("headline").textContent = "Not available on this page";
    $("detail").textContent = "Open a website that asks for an emailed code.";
  }
  if (status && "gmail" in status && typeof status.gmail === "boolean") {
    $("gmail").textContent = status.gmail ? "Gmail connected." : "Gmail isn't connected yet. Open Settings to connect.";
    $("gmail").className = `meta ${status.gmail ? "ok" : "warn"}`;
  } else {
    $("gmail").textContent = "";
  }
}
$("turn-on").addEventListener("click", async () => {
  if (status?.state !== "off" || !status.pattern) return;
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [status.pattern] });
  } catch {
    granted = false;
  }
  if (!granted) {
    $("detail").textContent = "Chrome didn't grant access, so CodeDrop stays off here.";
    return;
  }
  try {
    await chrome.runtime.sendMessage({ type: "CD_SITE_ENABLED", tabId: tab?.id });
  } catch {}
  await load();
});
$("turn-off").addEventListener("click", async () => {
  if (status?.state !== "enabled" || !status.pattern) return;
  try {
    await chrome.permissions.remove({ origins: [status.pattern] });
  } catch {}
  try {
    await chrome.runtime.sendMessage({ type: "CD_SITE_ENABLED" });
  } catch {}
  await load();
});
$("settings").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
void load();
