import { ConfigService } from '@nestjs/config';

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
 * Security Configuration Builder
 * Builds security configuration based on environment variables
 */
export class SecurityConfigBuilder {
  constructor(private configService: ConfigService) {}

  /**
   * Build security configuration based on environment
   */
  build(): SecurityConfig {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const allowedOrigins = this.configService.get<string>('ALLOWED_ORIGINS', frontendUrl)
      .split(',')
      .map(origin => origin.trim());

    return {
      helmet: this.buildHelmetConfig(isProduction, allowedOrigins),
      cors: this.buildCorsConfig(isProduction, allowedOrigins),
    };
  }

  private buildHelmetConfig(isProduction: boolean, allowedOrigins: string[]) {
    return {
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
    };
  }

  private buildCorsConfig(isProduction: boolean, allowedOrigins: string[]) {
    return {
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
    };
  }
}