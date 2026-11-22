// Stand-in for the NestJS backend in the Ingress behaviour test (#1959).
//
// It reproduces the response headers that matter to the Ingress, copied from
// what the real backend sends: Helmet's defaults (note X-Frame-Options DENY
// and the backend's own CSP/HSTS values, which differ from the Ingress
// policy) and the `cors` package's behaviour for an allow-listed origin.
// Run with `node ingress-stub-backend.js` inside a container named `backend`.
const http = require('node:http');
const crypto = require('node:crypto');

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

// Minimal Engine.IO v4 / Socket.IO v5 server for the WebSocket transport, so the
// Ingress test can prove an upgrade survives the proxy (#1975). It speaks only
// text frames under 126 bytes, which is all the test sends.
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function textFrame(text) {
  const payload = Buffer.from(text);
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function sendText(socket, text) {
  socket.write(textFrame(text));
}

// Split a buffer into complete masked client text frames, so frames that
// arrive coalesced or split across reads are still read one by one. Returns
// the texts (null for a close frame) and the unread remainder.
function readClientFrames(buffer) {
  const texts = [];
  while (buffer.length >= 6) {
    const length = buffer[1] & 0x7f;
    if (buffer.length < 6 + length) break;
    const mask = buffer.subarray(2, 6);
    const payload = Buffer.from(buffer.subarray(6, 6 + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    texts.push((buffer[0] & 0x0f) === 0x8 ? null : payload.toString());
    buffer = buffer.subarray(6 + length);
  }
  return { texts, rest: buffer };
}

function onUpgrade(req, socket, head) {
  const url = new URL(req.url, 'http://stub');
  if (!url.pathname.startsWith('/socket.io/') || url.searchParams.get('transport') !== 'websocket') {
    return socket.destroy();
  }
  console.log(req.url);
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + WS_GUID).digest('base64');
  // One write for the 101 response and the Engine.IO open frame, so the client
  // can receive both in a single read (the open frame then arrives as `head`).
  socket.write(Buffer.concat([
    Buffer.from([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '', '',
    ].join('\r\n')),
    textFrame('0' + JSON.stringify({ sid: 'stub-eio', upgrades: [], pingInterval: 25000, pingTimeout: 20000 })),
  ]));
  let pending = Buffer.alloc(0);
  const onBytes = chunk => {
    const { texts, rest } = readClientFrames(Buffer.concat([pending, chunk]));
    pending = rest;
    for (const text of texts) handleText(text);
  };
  const handleText = text => {
    if (text === null) return socket.end();
    if (text === '40') sendText(socket, '40{"sid":"stub-sio"}');
    else if (text === '2') sendText(socket, '3');
    else if (text.startsWith('42["echo"')) {
      // Report what the Ingress told the backend, so the test can read it.
      sendText(socket, `42["echo",{"proto":"${req.headers['x-forwarded-proto']}","host":"${req.headers.host}"}]`);
    }
  };
  socket.on('data', onBytes);
  if (head.length) onBytes(head);
  socket.on('error', () => {});
}

http
  .createServer((req, res) => {
    console.log(req.url);
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
  .on('upgrade', onUpgrade)
  .listen(3001, '0.0.0.0');
