// Stands in for the extension's background worker on local test pages.
// ?mode=code (default, 6 digits), ?mode=eight (8 digits): "waiting" once, then a fake code. ?mode=setup: Gmail not connected.
globalThis.__codeDropTestPage = true;
window.__calls = 0;
window.chrome = { runtime: { sendMessage: async (m) => {
  if (m.type !== "CD_CHECK") return { ok: true };
  window.__calls++;
  const mode = new URLSearchParams(location.search).get("mode") || "code";
  if (mode === "setup") return { ok: false, reason: "needs_setup", siteName: "example.com" };
  if (window.__calls < 2) return { ok: false, reason: "waiting", siteName: "example.com" };
  const code = mode === "eight" ? "12345678" : "482915";
  return { ok: true, code, receivedAt: Date.now() - 20000, serviceName: "Example", siteName: "example.com" };
} } };
