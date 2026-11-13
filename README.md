# CodeDrop

**Email verification codes, offered right where you need them.**

When a website asks for the code it just emailed you, CodeDrop finds that email in your Gmail and shows the code in a small bubble next to the code box, the way Safari offers codes from Messages. You click **Fill**. No switching to Gmail, no copying digits.

> **Status:** early prototype (v0.3). Chrome on Mac and Windows. Gmail only. Numeric codes of 4 to 8 digits. You set up your own free Google sign-in ID (about 10 minutes, steps below).

## What it looks like

```
  [ 4 ][ 8 ][ 2 ][ 9 ][ 1 ][ 5 ]
  ┌──────────────────────────────────────────┐
  │ Microsoft code                           │
  │ 482915            [ Fill ] [ Copy ]   ×  │
  │ From Gmail · just now                    │
  └──────────────────────────────────────────┘
```

Confirmed on real sign-ins: Microsoft (`login.live.com`, six separate boxes) and Meta's Muse (`muse.ai`, one hidden box behind six drawn ones).

## Safety first

A code is only useful to an attacker if you can be tricked into typing it on the wrong site. CodeDrop is built so that it never helps with that:

- **Same company only.** A code is offered on a website only if **Gmail itself verified** (DMARC pass, or a DKIM signature aligned with the sender) that the email came from the **same company as that website**. GitHub's code is offered on `github.com`, never on `github-login.help`. A short, reviewed table covers companies that send from another domain they own (e.g. `muse.ai` ↔ `meta.com`, `facebook.com` ↔ `facebookmail.com`).
- **No user-made pages.** On sites where people publish their own pages (Tumblr blogs, Salesforce and Atlassian customer sites, Substack, Medium…), only the company's own sign-in pages get codes.
- **You click Fill.** Nothing is typed until you click, and the click must be a real one. CodeDrop never presses submit (some sites continue on their own once the code is in).
- **Fresh codes only.** Emails older than 10 minutes are ignored. If you pressed Resend, the newest code wins.
- **No servers.** CodeDrop talks only to Google's Gmail API with read-only access. No analytics, no tracking. See [PRIVACY.md](PRIVACY.md).

## Where it works

- **130 popular sites, built in** (Microsoft, Apple, Amazon, Starlink, PayPal, the big banks, Netflix, Uber, Airbnb, LinkedIn, X, ChatGPT, Claude, GitHub, Slack, Zoom…). The bubble appears automatically. The list is in `manifest.json` under `content_scripts`.
- **Any other https site:** when a page shows a code box, CodeDrop's toolbar icon gets an **orange dot**. Click it → **Turn on**, and Chrome asks you once. After that the bubble appears automatically on that site. Turn sites off from the popup or the Settings page.

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose this folder.
3. Copy CodeDrop's **ID** from its card (a 32-letter string). You need it in the next step.

## One-time Google setup (about 10 minutes, free)

Gmail only lets an app read mail if it has its own Google sign-in ID. You create one in your own Google account; nobody else's server is involved.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project named **CodeDrop**. No billing is needed.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **Google Auth Platform** (or **OAuth consent screen**) → **Get started**: app name **CodeDrop**, audience **External**, your email as the contact. Keep it in **Testing** and add your Gmail address under **Audience → Test users**.
4. **Data access** (or **Scopes**) → **Add or remove scopes** → `https://www.googleapis.com/auth/gmail.readonly` → **Update** → **Save**.
5. **Clients → Create client** → application type **Chrome Extension** → **Item ID**: the ID you copied from `chrome://extensions` → **Create**. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`; it is not a secret).
6. In `manifest.json`, replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your Client ID.
7. In `chrome://extensions`, click CodeDrop's reload arrow. Right-click the CodeDrop icon → **Options** → **Connect Gmail**. Google will say the app isn't verified: it's your own app, so choose **Continue**.

While your Google project is in Testing, Google asks you to reconnect about once a week. The bubble shows **Connect** when that happens.

> If the ID on the extension card changes (for example after moving the folder), update the Item ID in your Google client.

## How it works

- `code-bubble.js` runs on built-in sites and sites you turned on. It looks for a code box: a box marked `one-time-code`, 4 to 8 small boxes that belong together, or a box labelled as a verification or security code (including invisible boxes behind drawn digits, and boxes inside iframes, web components and pop-up dialogs). Then it asks the background worker for a code every 3 seconds, for up to 3 minutes.
- `background.js` (the CodeDrop section at the end) searches Gmail for received sign-in-looking emails from the last 10 minutes, checks Gmail's own `Authentication-Results`, applies the same-company rule, and reads a 4- to 8-digit code that sits next to wording such as "verification code", "code is:" or "the code below:".
- `toolbar.html/js` is the toolbar popup (turn a site on or off). `setup.html/js` is the Settings page (connect Gmail, list of sites).
- Chrome's built-in page rules (`declarativeContent`) add the orange dot without giving CodeDrop access to the page.

The start of `background.js` and `popup.html` come from the original prototype (manual "Gmail tab" and fixture modes). They're not on the toolbar anymore.

## Tests

- `./tests/run-rule-tests.sh` runs the rule tests (code wording, sender verification, same-company rule, user-made pages, company names) against the real functions in `background.js`, using macOS's built-in JavaScript. No Node needed. The fixtures in `tests/fixtures.js` copy the structure of real sign-in emails, with fake codes and addresses.
- `perl tests/serve.pl`, then open `http://127.0.0.1:8765/tests/pages/microsoft-digits.html` or `hidden-single.html` to see the bubble on mock code boxes, with a stand-in for Gmail.

## Limits

- Gmail only. Numeric codes of 4 to 8 digits.
- Only codes that arrive by email. Not SMS, authenticator apps or passkeys.
- Some sites only react to real keypresses. Use **Copy** there.
- The domain rule uses a built-in list of multi-part suffixes (`co.uk`, `github.io`, …), not the full Public Suffix List yet.
- Not a security product. It can't protect you from malware or other extensions that read pages.

## Adding a built-in site

Add `"https://*.example.com/*"` to `content_scripts.matches` in `manifest.json`. If the company sends codes from a different domain it owns, add the pair to `CD_ALIASES` in `background.js`, using the sender domain from a real code email. If people can publish their own pages on subdomains of that site, add it to `CD_ONLY_HOSTS`.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Free for personal and other non-commercial use. Commercial use, including selling CodeDrop or a modified version, needs permission from the copyright holder.

Copyright 2026 Coachella Valley Digital LLC. For commercial licensing or other questions: hello@coachellavalleydigital.com
