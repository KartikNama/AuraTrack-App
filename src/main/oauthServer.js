/**
 * Local OAuth Callback Server for Azure AD SSO Flow
 */

const http = require('http');
const { logger } = require('../utils/logger');

const OAUTH_PORT = 54321;
let serverInstance = null;

function startOAuthServer(onTokensReceived) {
  if (serverInstance) return;

  serverInstance = http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://localhost:${OAUTH_PORT}`);

      if (parsedUrl.pathname === '/callback') {
        const accessToken = parsedUrl.searchParams.get('access_token');
        const refreshToken = parsedUrl.searchParams.get('refresh_token');

        res.writeHead(200, { 'Content-Type': 'text/html' });

        if (accessToken && refreshToken) {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>AuraTrack Authentication</title>
                <style>
                  body { font-family: -apple-system, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; text-align: center; }
                  .card { background: #1e293b; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                  h2 { color: #38bdf8; }
                </style>
              </head>
              <body>
                <div class="card">
                  <h2>Authentication Successful</h2>
                  <p>You can close this tab and return to the AuraTrack desktop app.</p>
                </div>
              </body>
            </html>
          `);

          if (typeof onTokensReceived === 'function') {
            onTokensReceived({ accessToken, refreshToken });
          }
        } else {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Authentication Error</title></head>
              <body style="background: #0f172a; color: #f87171; text-align: center; padding: 40px;">
                <h2>Authentication Failed</h2>
                <p>No valid tokens were received in the redirect URL.</p>
              </body>
            </html>
          `);
        }
      }
    } catch (err) {
      logger.error('Error handling OAuth HTTP callback:', err);
    }
  });

  serverInstance.listen(OAUTH_PORT, () => {
    logger.info(`OAuth callback listener active on http://localhost:${OAUTH_PORT}/callback`);
  });

  serverInstance.on('error', (err) => {
    logger.warn('OAuth callback server error:', err.message);
  });
}

function stopOAuthServer() {
  if (serverInstance) {
    try {
      serverInstance.close();
    } catch (_) {}
    serverInstance = null;
  }
}

module.exports = {
  startOAuthServer,
  stopOAuthServer,
  OAUTH_PORT
};
