import { ConfigService } from '@nestjs/config';

/**
 * SSL configuration utilities for database connections
 */

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
 * @param configService - The NestJS config service
 * @returns `false`, or an SSL options object when enabled
 */
export function createSSLConfig(configService: ConfigService): any {
  const sslEnabled = configService.get<string>('DB_SSL', 'false') === 'true';

  if (!sslEnabled) {
    return false;
  }

  // Enabled: always validate the server certificate.
  const sslCA = configService.get<string>('DB_SSL_CA');
  const sslCert = configService.get<string>('DB_SSL_CERT');
  const sslKey = configService.get<string>('DB_SSL_KEY');

  // Full mutual-TLS material supplied.
  if (sslCA && sslCert && sslKey) {
    return {
      rejectUnauthorized: true,
      ca: sslCA,
      cert: sslCert,
      key: sslKey,
    };
  }

  // Encryption with server certificate validation.
  return {
    rejectUnauthorized: true,
  };
}
