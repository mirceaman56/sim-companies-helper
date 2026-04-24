#!/usr/bin/env node
/**
 * Generates a Chrome Web Store OAuth2 refresh token.
 * Usage: node scripts/get-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
 */
import https from "https";
import http from "http";

const [, , clientId, clientSecret] = process.argv;

if (!clientId || !clientSecret) {
  console.error(
    "Usage: node scripts/get-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>"
  );
  process.exit(1);
}

const PORT = 9004;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";

const authUrl =
  `https://accounts.google.com/o/oauth2/auth` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.end(`<h2>Error: ${error}</h2>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.end("<h2>No code received.</h2>");
    return;
  }

  res.end("<h2>✅ Authorized! You can close this tab.</h2>");
  server.close();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  }).toString();

  const tokenReq = https.request(
    {
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (tokenRes) => {
      let data = "";
      tokenRes.on("data", (chunk) => (data += chunk));
      tokenRes.on("end", () => {
        const json = JSON.parse(data);
        if (json.refresh_token) {
          console.log("\n✅ Refresh token:\n");
          console.log(json.refresh_token);
          console.log("\nAdd this as CWS_REFRESH_TOKEN in GitHub Secrets.\n");
        } else {
          console.error("\n❌ Failed:", json);
        }
      });
    }
  );

  tokenReq.write(body);
  tokenReq.end();
});

server.listen(PORT, () => {
  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl);
  console.log("\nWaiting for authorization...\n");
});
