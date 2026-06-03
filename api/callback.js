// Vercel serverless function — completes the GitHub OAuth flow for Decap CMS.
// GitHub redirects back here with ?code=...  We exchange it for an access token
// and hand that token back to the Decap window using its postMessage handshake.

module.exports = async (req, res) => {
  const clientId = process.env.GITHUB_OAUTH_ID;
  const clientSecret = process.env.GITHUB_OAUTH_SECRET;

  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const url = new URL(req.url, `https://${host}`);
    const code = url.searchParams.get("code");

    if (!code) throw new Error("No 'code' returned from GitHub.");
    if (!clientId || !clientSecret) {
      throw new Error("Missing GITHUB_OAUTH_ID / GITHUB_OAUTH_SECRET env vars.");
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const data = await tokenRes.json();
    const token = data.access_token;

    const result = token
      ? "success:" + JSON.stringify({ token, provider: "github" })
      : "error:" + JSON.stringify(data || { message: "NO_TOKEN" });

    // Decap handshake: the opener (CMS) posts 'authorizing:github', then we
    // reply with 'authorization:github:success:{...}' to the opener's origin.
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Authorizing…</title></head>
<body>
<p>Authorizing… you can close this window if it doesn't close automatically.</p>
<script>
  (function () {
    var message = 'authorization:github:${result.replace(/'/g, "\\'")}';
    function receive(e) {
      if (!e.data || String(e.data).indexOf('authorizing:github') === -1) return;
      window.opener && window.opener.postMessage(message, e.origin);
      window.removeEventListener('message', receive, false);
    }
    window.addEventListener('message', receive, false);
    // Kick off the handshake.
    window.opener && window.opener.postMessage('authorizing:github', '*');
  })();
</script>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.statusCode = 200;
    res.end(html);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("OAuth callback error: " + err.message);
  }
};
