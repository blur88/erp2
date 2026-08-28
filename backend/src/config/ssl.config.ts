import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SSL configuration utilities for database connections
 */

const logger = new Logger('SSLConfig');

/**
 * Builds the TypeORM `ssl` option from `DB_SSL`.
 *
 * SSL is **opt-in in every environment**, including production. `NODE_ENV` is
 * deliberately not consulted: the deployed topology runs Postgres as an
 * in-compose container on a private Docker network, and that endpoint serves
 * no TLS, so a production-only override made `DB_SSL` a knob the production
 * code path ignored (#1158). Encryption is selected by the flag, not inferred
 * from the environment.
 *
 * Set `DB_SSL=true` when the database actually serves TLS — a managed
 * provider, or a Postgres configured with certificates. In the compose files
 * this flag is fed from the `DATABASE_SSL` variable in `.env`.
 *
 * Server trust and client authentication are **independent** (#1159):
 *
 * - `DB_SSL_CA` alone is the private/managed-CA shape — the server presents a
 *   certificate signed by a CA the system trust store does not carry. This is
 *   the common managed-database configuration. An earlier revision required
 *   all three of CA/cert/key before honouring any of them, so a CA-only
 *   deployment had its CA silently dropped and then failed validation against
 *   the system store.
 * - `DB_SSL_CERT` + `DB_SSL_KEY` are client credentials (mutual TLS). They do
 *   not require a custom CA: authenticating the client against a server whose
 *   certificate the system store already trusts is a valid configuration and
 *   is not warned about.
 *
 * A partial client pair — exactly one of cert/key — cannot be used, so it is
 * omitted and warned about rather than passed through. Warnings never include
 * credential contents.
 *
 * @param configService - The NestJS config service
 * @returns `false`, or an SSL options object when enabled
 */
export function createSSLConfig(configService: ConfigService): any {
  const sslEnabled = configService.get<string>('DB_SSL', 'false') === 'true';

  if (!sslEnabled) {
    return false;
  }

  const sslCA = configService.get<string>('DB_SSL_CA');
  const sslCert = configService.get<string>('DB_SSL_CERT');
  const sslKey = configService.get<string>('DB_SSL_KEY');

  // Enabled: always validate the server certificate.
  const ssl: Record<string, unknown> = { rejectUnauthorized: true };

  // Server trust. Without this the server certificate is validated against the
  // system trust store, which is correct for a publicly-signed certificate.
  if (sslCA) {
    ssl.ca = sslCA;
  }

  // Client authentication. Both halves are required; a lone cert or key is
  // unusable, so drop it loudly instead of handing node-postgres a half pair.
  if (sslCert && sslKey) {
    ssl.cert = sslCert;
    ssl.key = sslKey;
  } else if (sslCert || sslKey) {
    logger.warn(
      `DB_SSL_${sslCert ? 'CERT' : 'KEY'} is set but DB_SSL_${sslCert ? 'KEY' : 'CERT'} is not; ` +
        'client certificate authentication needs both. Ignoring the incomplete pair and ' +
        'connecting with server validation only.',
    );
  }

  return ssl;
}
