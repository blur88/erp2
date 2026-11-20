// Stand-in for the NestJS backend in the Ingress behaviour test (#1959).
//
// It reproduces the response headers that matter to the Ingress, copied from
// what the real backend sends: Helmet's defaults (note X-Frame-Options DENY
// and the backend's own CSP/HSTS values, which differ from the Ingress
// policy) and the `cors` package's behaviour for an allow-listed origin.
// Run with `node ingress-stub-backend.js` inside a container named `backend`.
const http = require('node:http');

const ALLOWED_ORIGIN = 'http://localhost';

const helmetHeaders = {
  'Content-Security-Policy': "default-src 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-XSS-Protection': '0',
};

http
  .createServer((req, res) => {
    const origin = req.headers.origin;
    const headers = { ...helmetHeaders, 'X-Backend': 'stub' };

    if (origin === ALLOWED_ORIGIN) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers.Vary = 'Origin';
    }

    if (req.method === 'OPTIONS') {
      if (origin === ALLOWED_ORIGIN) {
        headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization';
        headers['Access-Control-Max-Age'] = '86400';
      }
      res.writeHead(200, { ...headers, 'Content-Length': '0' });
      return res.end();
    }

    const path = req.url.split('?')[0];
    let status = 404;
    let body = { statusCode: 404, message: `Cannot ${req.method} ${path}` };

    if (path === '/api/health') {
      status = 200;
      body = { status: 'ok' };
    } else if (path === '/api/auth/me') {
      status = 401;
      body = { statusCode: 401, message: 'Unauthorized' };
    } else if (/^\/api\/auth\/(login|register)\/?$/i.test(path) && req.method === 'POST') {
      status = 401;
      body = { statusCode: 401, message: 'Invalid credentials' };
    } else if (path === '/api/error') {
      status = 500;
      headers['Cache-Control'] = 'no-store';
      body = { statusCode: 500, message: 'Internal server error' };
    } else if (path === '/uploads/logo.png') {
      status = 200;
      headers['Cache-Control'] = 'public, max-age=0';
      headers['Content-Type'] = 'image/png';
      headers.ETag = 'W/"stub-logo"';
      res.writeHead(status, headers);
      return res.end('png');
    } else if (path.startsWith('/socket.io/')) {
      status = 200;
      body = { sid: 'stub' };
    }

    res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  })
  .listen(3001, '0.0.0.0');
