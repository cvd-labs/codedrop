# CodeDrop privacy

CodeDrop runs entirely in your browser. There is no CodeDrop server.

## What CodeDrop reads

- **Gmail (read-only, Google's official Gmail API).** Only while a code box is open on a site where CodeDrop is on. It asks Gmail for received emails from the last 10 minutes that look like sign-in emails (words such as "code", "verification", "sign in"), at most 10 at a time, every 3 seconds, for up to 3 minutes.
- **Pages where CodeDrop is on.** It looks at form fields to find the code box. It does not read what you type in other fields.

## What CodeDrop keeps

- **Not stored on disk:** email bodies and codes. For a matching email it keeps the sender, time, Gmail's verification result and the six-digit code in memory, briefly, so it doesn't fetch the same email twice. The memory is cleared when Chrome stops the background worker (usually within a minute).
- **Stored by Chrome:** the list of sites you turned on (as Chrome site permissions). Your Google sign-in token is managed by Chrome's identity system, not by CodeDrop.
- **Never logged:** codes. The page console shows only what kind of code box CodeDrop found and whether a code was found.

## What CodeDrop sends

- Requests to `gmail.googleapis.com` and `oauth2.googleapis.com`, which go to Google. Nothing else: no analytics, no telemetry, no third parties.

## Your control

- **Disconnect:** CodeDrop Settings → **Disconnect** (this revokes the token), or remove access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Turn sites off:** the toolbar popup or the Settings page.
- **Remove CodeDrop:** `chrome://extensions` → **Remove**.

Each user creates their own Google sign-in ID, so the Google Cloud project that can read your Gmail is yours.

Questions: hello@coachellavalleydigital.com (Coachella Valley Digital LLC).
