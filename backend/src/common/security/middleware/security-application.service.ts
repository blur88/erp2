import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import compression from "compression";
import {
  SecurityConfig,
  SecurityConfigBuilder,
} from "../config/security.config";

/**
 * Security Application Service
 * Applies security middleware and configuration to NestJS application
 */
export class SecurityApplicationService {
  private readonly securityConfig: SecurityConfig;

  constructor(private configService: ConfigService) {
    const configBuilder = new SecurityConfigBuilder(configService);
    this.securityConfig = configBuilder.build();
  }

  /**
   * Apply security configuration to NestJS application
   */
  applySecurity(app: INestApplication): void {
    // Apply Helmet for security headers
    this.applyHelmetSecurity(app);

    // Apply CORS configuration
    this.applyCorsConfiguration(app);

    // Apply compression
    this.applyCompression(app);

    // Trust proxy (for proper IP detection behind reverse proxy)
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  /**
   * Get security configuration
   */
  getSecurityConfig(): SecurityConfig {
    return this.securityConfig;
  }

  /**
   * Apply Helmet security headers
   */
  private applyHelmetSecurity(app: INestApplication): void {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives:
            this.securityConfig.helmet.contentSecurityPolicy.directives,
          reportOnly: this.configService.get<boolean>("CSP_REPORT_ONLY", false),
        },
        hsts: {
          maxAge: this.securityConfig.helmet.hsts.maxAge,
          includeSubDomains: this.securityConfig.helmet.hsts.includeSubDomains,
          preload: this.securityConfig.helmet.hsts.preload,
        },
        frameguard: {
          action: this.securityConfig.helmet.frameguard.action as any,
        },
        noSniff: this.securityConfig.helmet.noSniff,
        xssFilter: this.securityConfig.helmet.xssFilter,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        permittedCrossDomainPolicies: false,
        dnsPrefetchControl: { allow: false },
        ieNoOpen: true,
        hidePoweredBy: true,
      }),
    );
  }

  /**
   * Apply CORS configuration
   */
  private applyCorsConfiguration(app: INestApplication): void {
    app.enableCors({
      origin: this.securityConfig.cors.origin,
      methods: this.securityConfig.cors.methods,
      allowedHeaders: this.securityConfig.cors.allowedHeaders,
      credentials: this.securityConfig.cors.credentials,
      maxAge: this.securityConfig.cors.maxAge,
      optionsSuccessStatus: 200, // For IE11
    });
  }

  /**
   * Apply compression middleware
   */
  private applyCompression(app: INestApplication): void {
    app.use(
      compression({
        level: 6, // Compression level (1-9)
        threshold: 1024, // Only compress responses > 1KB
        filter: (req, res) => {
          // Don't compress if the request includes a cache-control no-transform directive
          if (
            req.headers["cache-control"] &&
            req.headers["cache-control"].includes("no-transform")
          ) {
            return false;
          }
          return compression.filter(req, res);
        },
      }),
    );
  }
}
