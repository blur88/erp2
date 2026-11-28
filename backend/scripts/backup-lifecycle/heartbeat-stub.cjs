// Local stand-in for the two Healthchecks.io heartbeat checks (#2115). It only
// records pings: one JSON line per GET to /ping/primary or /ping/secondary.
// Anything else is a 404 and is not recorded. Nothing here is sent off-host.
//
// Usage: node heartbeat-stub.cjs PORT LOG_FILE
const fs = require('node:fs');
const http = require('node:http');

const [portArg, logFile] = process.argv.slice(2);
const port = Number(portArg);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !logFile) {
  process.stderr.write('usage: node heartbeat-stub.cjs PORT LOG_FILE\n');
  process.exit(64);
}

const PATHS = new Set(['/ping/primary', '/ping/secondary']);

const server = http.createServer((request, response) => {
  const { method, url } = request;
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  if (!PATHS.has(url)) {
    response.writeHead(404).end();
    return;
  }
  // Recorded synchronously, before the response, so the gate can read the line once the backend has the answer.
  fs.appendFileSync(logFile, `${JSON.stringify({ path: url, at: new Date().toISOString() })}\n`);
  response.writeHead(200, { 'Content-Type': 'text/plain' }).end('OK');
});

server.listen(port, () => {
  process.stdout.write(`heartbeat stub listening on ${port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
