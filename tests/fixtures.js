// Synthetic Gmail API messages for CodeDrop's rule tests. Shapes follow real
// sign-in emails (header order, folded From, plain-text body), but every
// address and code here is fake.
function cdTestBase64Url(text) {
  const bytes = unescape(encodeURIComponent(text));
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i), b = bytes.charCodeAt(i + 1), c = bytes.charCodeAt(i + 2);
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + (i + 1 < bytes.length ? chars[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? chars[n & 63] : "=");
  }
  return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function cdTestMessage({ id, receivedAt, headers, plain, html }) {
  const parts = [];
  if (plain) parts.push({ mimeType: "text/plain", body: { data: cdTestBase64Url(plain) } });
  if (html) parts.push({ mimeType: "text/html", body: { data: cdTestBase64Url(html) } });
  return {
    id,
    internalDate: String(receivedAt),
    payload: { mimeType: "multipart/alternative", headers: Object.entries(headers).map(([name, value]) => ({ name, value })), parts }
  };
}
// Microsoft account "Your single-use code" email (Nov 2026 layout).
function cdMicrosoftSingleUseCode(receivedAt, code, overrides) {
  const headers = Object.assign({
    "Delivered-To": "user@example.com",
    "ARC-Authentication-Results": "i=2; mx.google.com; dkim=pass header.i=@accountprotection.microsoft.com header.s=selector1; arc=pass (i=1); dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=accountprotection.microsoft.com",
    "Return-Path": "<account-security-noreply@accountprotection.microsoft.com>",
    "Authentication-Results": "mx.google.com;\n       dkim=pass header.i=@accountprotection.microsoft.com header.s=selector1 header.b=abcdEFGH;\n       arc=pass (i=1);\n       spf=pass (google.com: domain of account-security-noreply@accountprotection.microsoft.com designates 2a01:111:f403:c001::5 as permitted sender) smtp.mailfrom=account-security-noreply@accountprotection.microsoft.com;\n       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=accountprotection.microsoft.com",
    "X-MS-Exchange-Authentication-Results": "mx.microsoft.com 1; spf=none; dkim=none (message not signed) header.d=none;dmarc=none action=none header.from=accountprotection.microsoft.com;",
    "From": "Microsoft account team\n\t<account-security-noreply@accountprotection.microsoft.com>",
    "Subject": "Your single-use code",
    "To": "user@example.com"
  }, overrides || {});
  const plain = [
    "Hi user@example.com,",
    "",
    "We received your request for a single-use code to use with your Microsoft account.",
    "",
    `Your single-use code is: ${code}`,
    "",
    "Only enter this code on an official website or app. Don't share it with anyone.",
    "",
    "Thanks,",
    "The Microsoft account team",
    "Privacy Statement: https://go.microsoft.com/fwlink/?LinkId=521839",
    "Microsoft Corporation, One Microsoft Way, Redmond, WA 98052"
  ].join("\r\n");
  return cdTestMessage({ id: "msft1", receivedAt, headers, plain });
}
// Meta "Use code … to log in" email: HTML only, code in subject and body.
function cdMetaLoginCode(receivedAt, code) {
  return cdTestMessage({
    id: "meta1",
    receivedAt,
    headers: {
      "Authentication-Results": "mx.google.com;\n       dkim=pass header.i=@email.meta.com header.s=s2048-2022-q3;\n       spf=pass smtp.mailfrom=notification@email.meta.com;\n       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=email.meta.com",
      "From": "\"Meta\" <notification@email.meta.com>",
      "Subject": `Use code ${code} to log in`,
      "To": "user@example.com"
    },
    html: `<span style="font-size:0px"> Hi there, You can log into your Meta account by entering the following code. Login code ${code} If you did not try to log in, you can disregard this message.</span><table><tr><td>Login code</td></tr><tr><td><div>${code}</div></td></tr></table><a href="mailto:user&#064;example.com">user&#064;example.com</a>`
  });
}
// GitHub "Your GitHub launch code" sign-up email (8 digits, Nov 2026 layout).
// The code also appears inside a link, and the body has a UUID and a ZIP code.
function cdGitHubLaunchCode(receivedAt, code) {
  const uuid = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
  return cdTestMessage({
    id: "gh1",
    receivedAt,
    headers: {
      "Authentication-Results": "mx.google.com;\n       dkim=pass header.i=@github.com header.s=pf2023;\n       spf=pass smtp.mailfrom=noreply@github.com;\n       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=github.com",
      "From": "GitHub <noreply@github.com>",
      "Subject": "\u{1F680} Your GitHub launch code",
      "To": "user@example.com"
    },
    plain: [
      "Here's your GitHub launch code!",
      "",
      "Continue signing up for GitHub by entering the code below:",
      "",
      code,
      "",
      "You can enter it by visiting the link below:",
      "",
      `https://github.com/account_verifications?verification=${uuid}&via_launch_code_email=true`,
      "",
      "You're receiving this email because you recently created a new GitHub account. If this wasn't you, please ignore this email.",
      "",
      "Not able to enter the code? Paste the following link into your browser:",
      "",
      `https://github.com/account_verifications/confirm/${uuid}/${code}`,
      "",
      "---",
      "Sent with <3 by GitHub.",
      "GitHub, Inc. 88 Colin P Kelly Jr Street",
      "San Francisco, CA 94107"
    ].join("\n")
  });
}
// Starlink "Your Starlink verification code" email (Nov 2026 layout): the code
// appears twice, next to a long signed link and a ZIP code.
function cdStarlinkCode(receivedAt, code) {
  return cdTestMessage({
    id: "sl1",
    receivedAt,
    headers: {
      "Authentication-Results": "mx.google.com;\n       dkim=pass header.i=@starlink.com header.s=s1;\n       spf=pass smtp.mailfrom=no-reply@starlink.com;\n       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=starlink.com",
      "From": "Starlink <no-reply@starlink.com>",
      "Subject": "Your Starlink verification code",
      "To": "user@example.com"
    },
    plain: `Use code ${code} to verify your identity with Starlink.\n\n| ### Do not share this code with anyone # ${code} Use the 6-digit code above to verify your identity. For security reasons, it will expire in 15 minutes. If you did not request this passcode, please reset your password[](https://starlink.com/api/notifications/v1/redirect/eyJhbGciOiJIUzI1NiJ9.eyJkZWxpdmVyeUlkIjoiMDI4OUYxQ0E3OUMwNzdFMTki.Gs9wzRCu4koioT1hc). ------------------------------ Space Exploration Technologies Corp | 1 Rocket Road, Hawthorne, CA 90250`
  });
}
// eufy "<code> is your code" sign-in email (Nov 2026 layout). eufy's store
// sign-in sends from eufylife.com, with a second DKIM signature from the mail
// service. The code is in the subject and alone on a line under the heading.
function cdEufyCode(receivedAt, code, overrides) {
  const headers = Object.assign({
    "Authentication-Results": "mx.google.com;\n       dkim=pass header.i=@eufylife.com header.s=1o2 header.b=abcdEFGH;\n       dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b=ijklMNOP;\n       spf=pass (google.com: domain of bounces+1234-5678-user=example.com@mailer1o2.eufylife.com designates 192.0.2.65 as permitted sender) smtp.mailfrom=\"bounces+1234-5678-user=example.com@mailer1o2.eufylife.com\";\n       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=eufylife.com",
    "From": "eufy <noreply-service@eufylife.com>",
    "Subject": `${code} is your code`,
    "To": "user@example.com"
  }, overrides || {});
  const plain = [
    "eufy Logo",
    "",
    "***********************",
    "Your verification code:",
    "***********************",
    "",
    "------",
    code,
    "------",
    "",
    "This code can only be",
    "used once. It expires in 15 minutes.",
    "",
    "\u00a9 eufy",
    "",
    "Privacy policy ",
    "( https://us.eufy.com/policies/privacy-policy )",
    "Terms of service ",
    "( https://us.eufy.com/policies/terms-of-service )"
  ].join("\r\n");
  return cdTestMessage({ id: "eufy1", receivedAt, headers, plain });
}
// Best Buy "Your verification code for your BestBuy.com account" email (Nov 2026
// plain-text layout): the code runs straight into the next sentence.
function cdBestBuyCode(receivedAt, code) {
  return cdTestMessage({
    id: "bb1",
    receivedAt,
    headers: {
      "Authentication-Results": "mx.google.com;\n       dkim=pass header.i=@emailinfo.bestbuy.com header.s=200608;\n       spf=pass smtp.mailfrom=bounce@emailinfo.bestbuy.com;\n       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=emailinfo.bestbuy.com",
      "From": "Best Buy Notifications <BestBuyInfo@emailinfo.bestbuy.com>",
      "Subject": "Your verification code for your BestBuy.com account",
      "To": "user@example.com"
    },
    plain: `Best Buy | Your verification code for your BestBuy.com account | CIA_CA_AcctVerificationCode\n\n Use this code to verify your account on BestBuy.com.\n\n View:\nhttps://click.emailinfo2.bestbuy.com/?qs=ABp7ImQiOjUwNjAsInQiOjEzNDU0\nWeb\n\n Please use this code to verify your account.\n\n Please enter this verification code on BestBuy.com(R) to verify your identity.Verification Code:${code}If you have any questions,\nhttps://www.bestbuy.com/contact-us?ref=E10C06R008&loc=BODY&CampaignID=516\nemail us or give us a call at 1-888-BEST BUY (1-888-237-8289).\n\n Best Buy 7601 Penn Avenue South, Richfield, MN 55423-3645\n\n (c) 2026 Best Buy. All rights reserved.`
  });
}
