// The TLS profile comparison behind the Ingress tests (#2016, ADR 0004).
// No Docker: the pinned guidelines fixture, its provenance record, the
// hand-written nginx/tls-intermediate.conf, and proof that the comparison
// fails when the configuration drifts. The Docker-backed handshake tests live
// in ingress.test.js and use the same fixture.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  FIXTURE, provenance, verifyFixtureChecksum, loadIntermediateProfile, directiveValues, nginxProfileProblems,
} = require('./fixtures/tls-profile');

const repo = path.resolve(__dirname, '../..');
const read = file => readFileSync(path.join(repo, file), 'utf8');
const conf = read('nginx/tls-intermediate.conf');

// Replace the one value of a directive, so each mutation changes one thing.
const withDirective = (config, name, value) =>
  config.replace(new RegExp(`^(\\s*${name}\\s+)[^;]*;`, 'm'), `$1${value};`);

describe('pinned guidelines fixture', () => {
  test('is the exact file the provenance record describes', () => {
    const { recorded, actual } = verifyFixtureChecksum();
    assert.match(recorded, /^[0-9a-f]{64}$/);
    assert.equal(actual, recorded, 'refresh the fixture and provenance together, from the recorded source URL');
  });

  test('names guidelines version 6.0 and a source that agrees with its own href', () => {
    const record = provenance();
    const profile = loadIntermediateProfile();
    assert.equal(record.version, 6);
    assert.equal(profile.version, record.version);
    assert.equal(profile.href, record.sourceUrl);
    assert.equal(record.sourceUrl, 'https://data.tlsref.org/guidelines/6.0.json');
    assert.match(record.retrievedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(record.fixture, path.basename(FIXTURE));
  });

  test('records a reason for each intentional deviation and each field it selects', () => {
    const record = provenance();
    const intermediate = JSON.parse(readFileSync(FIXTURE, 'utf8')).configurations.intermediate;
    assert.deepEqual(Object.keys(record.intentionalDeviations).sort(), ['hsts_min_age', 'ocsp_staple']);
    for (const field of Object.keys(record.intentionalDeviations)) {
      assert.ok(field in intermediate, `${field} must be a field of the Intermediate profile`);
      assert.match(record.intentionalDeviations[field], /ADR 0004/);
    }
    for (const field of Object.keys(record.selectedFields)) {
      assert.notEqual(field.split('.').reduce((o, key) => o?.[key], intermediate), undefined, field);
    }
  });

  test('has the shape the TLS tests read', () => {
    const profile = loadIntermediateProfile();
    assert.ok(profile.tls12Ciphers.length > 0);
    assert.ok(profile.tlsVersions.includes('TLSv1.2') && profile.tlsVersions.includes('TLSv1.3'));
    assert.ok(profile.curves.length > 0);
    assert.ok(profile.tls13CipherSuites.every(name => name.startsWith('TLS_')));
    assert.equal(profile.serverPreferredOrder, false);
  });
});

describe('deployed nginx/tls-intermediate.conf', () => {
  const profile = loadIntermediateProfile();

  test('states exactly the profile protocols, ciphers, groups and cipher preference', () => {
    assert.deepEqual(nginxProfileProblems(conf, profile), []);
  });

  test('has no DHE or other non-ECDHE TLS 1.2 suite, and no DH parameters', () => {
    const [ciphers] = directiveValues(conf, 'ssl_ciphers');
    for (const cipher of ciphers.split(':')) assert.match(cipher, /^ECDHE-(ECDSA|RSA)-/, cipher);
    assert.deepEqual(directiveValues(conf, 'ssl_dhparam'), []);
  });

  test('keeps the ADR 0004 deviations: no OCSP stapling, session tickets off', () => {
    assert.deepEqual(directiveValues(conf, 'ssl_stapling'), []);
    assert.deepEqual(directiveValues(conf, 'ssl_session_tickets'), ['off']);
  });

  test('cites the fixture source and version', () => {
    const { sourceUrl } = provenance();
    assert.ok(conf.includes(sourceUrl), `nginx/tls-intermediate.conf must cite ${sourceUrl}`);
    assert.match(conf, /guidelines 6\.0/);
    assert.doesNotMatch(conf, /ssl-config\.mozilla\.org/);
  });
});

describe('ADR 0004', () => {
  test('names the fixture source URL and guidelines version 6.0', () => {
    const adr = read('docs/adr/0004-ingress-terminated-https.md');
    assert.ok(adr.includes(provenance().sourceUrl), `ADR 0004 must cite ${provenance().sourceUrl}`);
    assert.match(adr, /guidelines version 6\.0/);
  });
});

describe('the profile comparison fails when the configuration drifts', () => {
  const profile = loadIntermediateProfile();
  const [ciphers] = directiveValues(conf, 'ssl_ciphers');
  const [curves] = directiveValues(conf, 'ssl_ecdh_curve');

  // Positive control: the comparison accepts the real config, so a failure
  // below is caused by the mutation.
  test('accepts the committed configuration', () => {
    assert.deepEqual(nginxProfileProblems(conf, profile), []);
  });

  const drift = [
    ['a deprecated DHE cipher is added', 'ssl_ciphers', `${ciphers}:DHE-RSA-AES128-GCM-SHA256`, /ssl_ciphers/],
    ['a deprecated DHE cipher is listed first', 'ssl_ciphers', `DHE-RSA-AES256-GCM-SHA384:${ciphers}`, /ssl_ciphers/],
    ['a required cipher is removed', 'ssl_ciphers', ciphers.split(':').slice(1).join(':'), /ssl_ciphers/],
    ['the last required cipher is removed', 'ssl_ciphers', ciphers.split(':').slice(0, -1).join(':'), /ssl_ciphers/],
    ['a required curve is removed', 'ssl_ecdh_curve', curves.split(':').slice(1).join(':'), /ssl_ecdh_curve/],
    ['the hybrid group is replaced by a curve outside the profile', 'ssl_ecdh_curve', curves.replace('X25519MLKEM768', 'secp521r1'), /ssl_ecdh_curve/],
    ['a curve outside the profile is added', 'ssl_ecdh_curve', `${curves}:secp521r1`, /ssl_ecdh_curve/],
    ['TLS 1.1 is enabled', 'ssl_protocols', 'TLSv1.1 TLSv1.2 TLSv1.3', /ssl_protocols/],
    ['TLS 1.3 is dropped', 'ssl_protocols', 'TLSv1.2', /ssl_protocols/],
    ['server cipher preference is turned on', 'ssl_prefer_server_ciphers', 'on', /ssl_prefer_server_ciphers/],
  ];
  for (const [label, name, value, expected] of drift) {
    test(`when ${label}`, () => {
      const problems = nginxProfileProblems(withDirective(conf, name, value), profile);
      assert.equal(problems.length, 1, JSON.stringify(problems));
      assert.match(problems[0], expected);
    });
  }

  test('when a directive is missing or repeated', () => {
    const missing = conf.replace(/^ssl_ecdh_curve .*$/m, '');
    assert.match(nginxProfileProblems(missing, profile).join(), /ssl_ecdh_curve: expected exactly one directive, found 0/);
    const repeated = `${conf}\nssl_protocols TLSv1.2 TLSv1.3;\n`;
    assert.match(nginxProfileProblems(repeated, profile).join(), /ssl_protocols: expected exactly one directive, found 2/);
  });

  test('a directive that appears only in a comment does not count', () => {
    const commentedOut = conf.replace(/^ssl_ciphers .*$/m, m => `# ${m}`);
    assert.match(nginxProfileProblems(commentedOut, profile).join(), /ssl_ciphers: expected exactly one directive, found 0/);
  });

  test('a profile edited away from the pinned fixture is a different expectation, not a pass', () => {
    const edited = { ...profile, tls12Ciphers: [...profile.tls12Ciphers, 'DHE-RSA-AES128-GCM-SHA256'] };
    assert.match(nginxProfileProblems(conf, edited).join(), /ssl_ciphers/);
  });
});
