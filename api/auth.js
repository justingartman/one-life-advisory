// Vercel serverless function — starts the GitHub OAuth flow for Decap CMS.
// Decap opens a popup to:  {base_url}/{auth_endpoint}  →  this function.
// We redirect the popup to GitHub's authorize screen.
//
// Required Vercel environment variables:
//   GITHUB_OAUTH_ID      — your GitHub OAuth App "Client ID"
//   GITHUB_OAUTH_SECRET  — your GitHub OAuth App "Client Secret"  (used in callback.js)

const crypto = require("crypto");

module.exports = (req, res) => {
  const clientId = process.env.GITHUB_OAUTH_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.end("Missing GITHUB_OAUTH_ID environment variable.");
    return;
  }

  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl =
    "https://github.com/login/oauth/authorize" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("repo,user")}` +
    `&state=${state}`;

  res.writeHead(302, { Location: authUrl });
  res.end();
};
