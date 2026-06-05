import { ConfigService } from "@nestjs/config";

/**
 * SSL configuration utilities for database connections
 */

/**
 * Creates secure SSL configuration based on environment
 * @param configService - The NestJS config service
 * @returns SSL configuration object
 */
export function createSSLConfig(configService: ConfigService): any {
  const isProduction = configService.get("NODE_ENV") === "production";

  if (!isProduction) {
    // Development/staging: allow SSL to be optionally enabled
    const sslEnabled = configService.get<string>("DB_SSL", "false") === "true";
    return sslEnabled;
  }

  // Production: enforce proper SSL with certificate validation
  const sslCA = configService.get<string>("DB_SSL_CA");
  const sslCert = configService.get<string>("DB_SSL_CERT");
  const sslKey = configService.get<string>("DB_SSL_KEY");

  // Allow production without full SSL certs for Docker environments
  // but always enforce encryption and certificate validation
  if (sslCA && sslCert && sslKey) {
    return {
      rejectUnauthorized: true,
      ca: sslCA,
      cert: sslCert,
      key: sslKey,
    };
  }

  // Fallback: enforce SSL with server certificate validation
  return {
    rejectUnauthorized: true,
  };
}
