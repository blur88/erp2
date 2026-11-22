// Expected TLS profile for the Ingress (#2016, ADR 0004), read from the pinned
// copy of the Mozilla Intermediate guidelines and nothing else.
//
// The deployed configuration (nginx/tls-intermediate.conf) is written by hand
// and is never generated from the fixture, so a test that compares the two has
// two independent sources. Only the fields named in the provenance file's
// selectedFields are read.
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const FIXTURE = path.join(__dirname, 'mozilla-tls-guidelines-6.0.json');
const PROVENANCE = path.join(__dirname, 'mozilla-tls-guidelines-6.0.provenance.json');

const provenance = () => JSON.parse(readFileSync(PROVENANCE, 'utf8'));

// The fixture bytes must still be the ones the provenance file recorded.
function verifyFixtureChecksum() {
  const recorded = provenance().sha256;
  const actual = createHash('sha256').update(readFileSync(FIXTURE)).digest('hex');
  return { recorded, actual, matches: recorded === actual };
}

function loadIntermediateProfile() {
  const guidelines = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const intermediate = guidelines.configurations.intermediate;
  return {
    version: guidelines.version,
    href: guidelines.href,
    tls12Ciphers: intermediate.ciphers.openssl,
    tls13CipherSuites: intermediate.ciphersuites,
    tlsVersions: intermediate.tls_versions,
    curves: intermediate.tls_curves,
    serverPreferredOrder: intermediate.server_preferred_order,
  };
}

// Directive values from nginx config text, comments stripped. nginx -T output
// repeats directives per context, so every occurrence is returned.
function directiveValues(config, name) {
  const pattern = new RegExp(`^\\s*${name}\\s+([^;]*);`, 'gm');
  return [...config.replace(/#.*$/gm, '').matchAll(pattern)].map(m => m[1].trim().replace(/\s+/g, ' '));
}

// Problems found when comparing nginx config text with the profile: an empty
// list means the config states exactly the profile's protocols, TLS 1.2
// ciphers, groups and cipher preference.
function nginxProfileProblems(config, profile) {
  const expected = {
    ssl_protocols: profile.tlsVersions.join(' '),
    ssl_ciphers: profile.tls12Ciphers.join(':'),
    ssl_ecdh_curve: profile.curves.join(':'),
    ssl_prefer_server_ciphers: profile.serverPreferredOrder ? 'on' : 'off',
  };
  const problems = [];
  for (const [name, value] of Object.entries(expected)) {
    const found = directiveValues(config, name);
    if (found.length !== 1) problems.push(`${name}: expected exactly one directive, found ${found.length}`);
    else if (found[0] !== value) problems.push(`${name}: expected "${value}", found "${found[0]}"`);
  }
  return problems;
}

module.exports = {
  FIXTURE, PROVENANCE, provenance, verifyFixtureChecksum,
  loadIntermediateProfile, directiveValues, nginxProfileProblems,
};
