import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';

export interface SecurityConfig {
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: string[];
        styleSrc: string[];
        scriptSrc: string[];
        imgSrc: string[];
        connectSrc: string[];
        fontSrc: string[];
        objectSrc: string[];
        mediaSrc: string[];
        frameSrc: string[];
      };
    };
    hsts: {
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
    frameguard: {
      action: string;
    };
    noSniff: boolean;
    xssFilter: boolean;
  };
  cors: {
    origin: string[] | boolean;
    methods: string[];
    allowedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  };
}

/**
 * Security Configuration
 * Configures security headers, CORS, and other security middleware
 */
export class SecurityConfigService {
  private readonly securityConfig: SecurityConfig;

  constructor(private configService: ConfigService) {
    this.securityConfig = this.buildSecurityConfig();
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
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
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
    app.use(helmet({
      contentSecurityPolicy: {
        directives: this.securityConfig.helmet.contentSecurityPolicy.directives,
        reportOnly: this.configService.get<boolean>('CSP_REPORT_ONLY', false),
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
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      permittedCrossDomainPolicies: false,
      dnsPrefetchControl: { allow: false },
      ieNoOpen: true,
      hidePoweredBy: true,
    }));
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
    app.use(compression({
      level: 6, // Compression level (1-9)
      threshold: 1024, // Only compress responses > 1KB
      filter: (req, res) => {
        // Don't compress if the request includes a cache-control no-transform directive
        if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
          return false;
        }
        return compression.filter(req, res);
      },
    }));
  }

  /**
   * Build security configuration based on environment
   */
  private buildSecurityConfig(): SecurityConfig {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const allowedOrigins = this.configService.get<string>('ALLOWED_ORIGINS', frontendUrl)
      .split(',')
      .map(origin => origin.trim());

    return {
      helmet: {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
              "'self'",
              "'unsafe-inline'", // Required for some CSS frameworks
              'https://fonts.googleapis.com',
            ],
            scriptSrc: [
              "'self'",
              // Add trusted script sources here
              ...(isProduction ? [] : ["'unsafe-eval'"]), // Allow eval in development
            ],
            imgSrc: [
              "'self'",
              'data:', // Allow data URLs for images
              'https:', // Allow HTTPS images
            ],
            connectSrc: [
              "'self'",
              ...allowedOrigins,
              // Add API endpoints that frontend needs to connect to
            ],
            fontSrc: [
              "'self'",
              'https://fonts.gstatic.com',
              'data:', // Allow data URLs for fonts
            ],
            objectSrc: ["'none'"], // Disable object/embed/applet
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"], // Disable frames unless needed
          },
        },
        hsts: {
          maxAge: 31536000, // 1 year in seconds
          includeSubDomains: true,
          preload: isProduction,
        },
        frameguard: {
          action: 'deny', // Prevent framing
        },
        noSniff: true, // Prevent MIME type sniffing
        xssFilter: true, // Enable XSS filtering
      },
      cors: {
        origin: isProduction ? allowedOrigins : true, // Allow all origins in development
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
          'Accept',
          'Accept-Language',
          'Content-Language',
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'Range',
        ],
        credentials: true, // Allow cookies and auth headers
        maxAge: 86400, // Preflight cache for 24 hours
      },
    };
  }

}