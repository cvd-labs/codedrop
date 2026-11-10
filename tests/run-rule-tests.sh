#!/bin/sh
# Runs tests/rule-tests.js against the real functions in background.js using
# macOS's built-in JavaScript (no Node needed): ./tests/run-rule-tests.sh
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
BG="$DIR/background.js"
TMP="$(mktemp -t codedrop-tests).js"
{
  cat <<'JS'
function atob(s) { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; let o = "", b = 0, n = 0; for (const ch of s.replace(/=+$/, "")) { b = (b << 6) | c.indexOf(ch); n += 6; if (n >= 8) { n -= 8; o += String.fromCharCode((b >> n) & 255); } } return o; }
class TextDecoder { decode(bytes) { let s = ""; for (const x of bytes) s += String.fromCharCode(x); try { return decodeURIComponent(escape(s)); } catch (e) { return s; } } }
function run() {
JS
  sed -n '/^\/\/ src\/lib\/email.ts/,/^\/\/ src\/background\/gmail-api-read.ts/p' "$BG"
  sed -n '/^\/\/ src\/lib\/extract-code.ts/,/^\/\/ src\/lib\/match.ts/p' "$BG"
  sed -n '/^var CD_FRESH_MS/,/^function isCodeDropMessage/p' "$BG" | sed '$d'
  sed -n '/^\/\/ Only recent, received mail/,/^\/\/ ---------- Hybrid mode/p' "$BG" | sed '$d'
  cat "$DIR/tests/fixtures.js" "$DIR/tests/rule-tests.js"
  cat <<'JS'
  const results = cdRunRuleTests();
  const failed = results.filter((r) => !r.pass);
  return results.map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `\n      got ${JSON.stringify(r.actual)}, expected ${JSON.stringify(r.expected)}`}`).join("\n") + `\n\n${results.length - failed.length}/${results.length} passed`;
}
JS
} > "$TMP"
osascript -l JavaScript "$TMP"
rm -f "$TMP"
