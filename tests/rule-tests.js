// CodeDrop rule tests: code extraction, sender verification and the
// same-company rule, run against the real functions from background.js.
function cdRunRuleTests() {
  const now = Date.now();
  const results = [];
  const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });
  const site = (host) => ({ reg: cdRegistrable(host) });
  const offer = (host, raws) => {
    const r = cdPickCode(raws.map(cdParseMessage).filter(Boolean), site(host), now);
    return r.ok ? { code: r.code, from: r.serviceName } : { reason: r.reason };
  };

  // Microsoft single-use code (regression: "code is: 123456" was not read).
  const msft = cdMicrosoftSingleUseCode(now - 20000, "123456");
  check("microsoft: code extracted", cdParseMessage(msft).codes, ["123456"]);
  check("microsoft: privacy link digits ignored", cdParseMessage(cdMicrosoftSingleUseCode(now, "123456")).codes.includes("521839"), false);
  check("microsoft: offered on login.live.com", offer("login.live.com", [msft]), { code: "123456", from: "Microsoft" });
  check("microsoft: offered on login.microsoftonline.com", offer("login.microsoftonline.com", [msft]).code, "123456");
  check("microsoft: offered on account.microsoft.com", offer("account.microsoft.com", [msft]).code, "123456");
  check("microsoft: not offered on lookalike", offer("login-live.help", [msft]), { reason: "waiting" });
  check("microsoft: not offered on github.com", offer("github.com", [msft]), { reason: "waiting" });
  check("microsoft: spoof without Gmail pass refused", offer("login.live.com", [cdMicrosoftSingleUseCode(now, "123456", {
    "Authentication-Results": "mx.google.com; dkim=none; spf=softfail smtp.mailfrom=evil.example; dmarc=fail (p=REJECT) header.from=accountprotection.microsoft.com"
  })]), { reason: "sender_unverified" });
  check("microsoft: Microsoft's own (non-Gmail) results ignored", offer("login.live.com", [cdMicrosoftSingleUseCode(now, "123456", {
    "Authentication-Results": "mx.microsoft.com 1; dmarc=pass header.from=accountprotection.microsoft.com"
  })]), { reason: "sender_unverified" });
  check("microsoft: stale code ignored", offer("login.live.com", [cdMicrosoftSingleUseCode(now - 11 * 60000, "123456")]), { reason: "waiting" });

  // GitHub launch code (regression: 8 digits and "the code below:" were not read).
  const gh = cdGitHubLaunchCode(now - 15000, "01234567");
  check("github: 8-digit code extracted (not the ZIP, UUID or link copy)", cdParseMessage(gh).codes, ["01234567"]);
  check("github: offered on github.com", offer("github.com", [gh]), { code: "01234567", from: "GitHub" });
  check("github: not offered on lookalike", offer("github-signup.help", [gh]), { reason: "waiting" });

  // Starlink.
  const sl = cdStarlinkCode(now - 10000, "246813");
  check("starlink: code extracted once (not the ZIP or link)", cdParseMessage(sl).codes, ["246813"]);
  check("starlink: offered on www.starlink.com", offer("www.starlink.com", [sl]), { code: "246813", from: "Starlink" });
  check("starlink: not offered on lookalike", offer("starlink-support.help", [sl]), { reason: "waiting" });

  // eufy: store sign-in on eufy.com, code emailed from eufylife.com.
  const eufy = cdEufyCode(now - 10000, "135790");
  check("eufy: code extracted once (subject and body)", cdParseMessage(eufy).codes, ["135790"]);
  check("eufy: offered on order.us.eufy.com", offer("order.us.eufy.com", [eufy]), { code: "135790", from: "eufy" });
  check("eufy: offered on passport.eufy.com", offer("passport.eufy.com", [eufy]).code, "135790");
  check("eufy: not offered on lookalike", offer("eufy-orders.help", [eufy]), { reason: "waiting" });
  check("eufy: not offered on github.com", offer("github.com", [eufy]), { reason: "waiting" });
  check("eufy: spoof without Gmail pass refused", offer("order.us.eufy.com", [cdEufyCode(now, "135790", {
    "Authentication-Results": "mx.google.com; dkim=pass header.i=@sendgrid.info header.s=smtpapi; spf=pass smtp.mailfrom=bounce@evil.example; dmarc=fail (p=QUARANTINE) header.from=eufylife.com"
  })]), { reason: "sender_unverified" });
  check("eufy: site name before a code arrives", cdCompanyName("eufy.com"), "eufy");

  // Meta (muse.ai) still works.
  check("meta: offered on muse.ai", offer("muse.ai", [cdMetaLoginCode(now - 5000, "654321")]), { code: "654321", from: "Meta" });
  check("meta: not offered on login.live.com", offer("login.live.com", [cdMetaLoginCode(now - 5000, "654321")]), { reason: "waiting" });

  // Code wording.
  const codes = (text) => extractCodes("", text);
  check("wording: 'code is: 123456'", codes("Your code is: 123456"), ["123456"]);
  check("wording: 'code is 123456'", codes("Your code is 123456"), ["123456"]);
  check("wording: 'Security code: 123456'", codes("Security code: 123456"), ["123456"]);
  check("wording: 'single-use code 123456'", codes("Use this single-use code 123456 to sign in"), ["123456"]);
  check("wording: 4-digit 'Your code is 4821'", codes("Your code is 4821"), ["4821"]);
  check("wording: 8-digit after 'the code below:'", codes("Enter the code below:\n\n87654321"), ["87654321"]);
  check("wording: strong code beats a year nearby", codes("Your verification code is 482915. \u00a9 2026 Example Inc."), ["482915"]);
  check("wording: year alone is not a code", codes("Your verification email from 2026"), []);
  check("wording: digits inside an ID are ignored", codes("Verification id 361f4334-874a"), []);
  check("wording: order number ignored", codes("Order number 123456 has shipped"), []);
  check("wording: zip code ignored", codes("Zip code: 123456"), []);

  // Company names in the bubble.
  check("name: known company", cdCompanyName("microsoft.com", "Microsoft account team"), "Microsoft");
  check("name: short sender name", cdCompanyName("examplebank.com", "Example Bank"), "Example Bank");
  check("name: generic sender name falls back to domain", cdCompanyName("examplebank.com", "Security Alerts"), "Examplebank");
  check("name: site before a code arrives", cdCompanyName("live.com"), "Microsoft");

  // User-published subdomains never get the company's codes.
  const allowedHost = (h) => cdHostAllowed(h, cdRegistrable(h));
  check("user pages: evil-blog.tumblr.com blocked", allowedHost("evil-blog.tumblr.com"), false);
  check("user pages: www.tumblr.com allowed", allowedHost("www.tumblr.com"), true);
  check("user pages: acme.my.salesforce.com blocked", allowedHost("acme.my.salesforce.com"), false);
  check("user pages: login.salesforce.com allowed", allowedHost("login.salesforce.com"), true);
  check("user pages: team.atlassian.net blocked", allowedHost("team.atlassian.net"), false);
  check("user pages: login.live.com unaffected", allowedHost("login.live.com"), true);

  // Registrable domains.
  check("domain: mail.notion.so", cdRegistrable("mail.notion.so"), "notion.so");
  check("domain: www.bbc.co.uk", cdRegistrable("www.bbc.co.uk"), "bbc.co.uk");
  check("domain: evil.vercel.app stays separate", cdRegistrable("evil.vercel.app"), "evil.vercel.app");

  return results;
}
