# Security

CodeDrop handles sign-in codes, so security reports are very welcome.

## Reporting a problem

Please report security issues **privately**: use GitHub's **Security → Report a vulnerability** on this repository, or email hello@coachellavalleydigital.com. Please don't open a public issue for security problems.

Especially interesting:
- A way to get CodeDrop to offer a code on a site that isn't the company that sent it.
- A way for a web page to read a code before you click **Fill**, or to click Fill for you.
- Emails that pass CodeDrop's checks without Gmail having verified the sender.

## Design notes

- Trust comes from Gmail's own `Authentication-Results` header (the first one, stamped `mx.google.com`): DMARC pass for the From domain, or a passing DKIM signature from the same registrable domain. Results added by other mail servers are ignored.
- A code is offered only on pages whose registrable domain matches the verified sender's, or on a reviewed same-owner alias (`CD_ALIASES` in `background.js`). Subdomains where users publish their own pages are excluded (`CD_ONLY_HOSTS`).
- The bubble lives in a closed shadow root inside CodeDrop's isolated content-script world. Fill only runs on a trusted (real) click.
- No remote code. Network access goes only to Google's Gmail and OAuth endpoints.

This is a prototype and has not had an independent security audit.
