import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { ThreatDetector } from "../threat-detection/detector";
import { RequestValidators } from "../threat-detection/validators";
import { SecurityLogger } from "../logging/security-logger";

/**
 * Security Monitoring Middleware
 * Detects and logs potential security threats without modifying data
 */
@Injectable()
export class SecurityMonitoringMiddleware implements NestMiddleware {
  private readonly logger: SecurityLogger;
  private readonly threatDetector: ThreatDetector;
  private readonly requestValidators: RequestValidators;

  constructor() {
    this.logger = new SecurityLogger();
    this.threatDetector = new ThreatDetector(this.logger);
    this.requestValidators = new RequestValidators(this.logger);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    try {
      // Skip monitoring for certain endpoints
      const skipPaths = ["/api/upload", "/api/webhooks", "/api/docs"];
      const shouldSkip = skipPaths.some((path) => req.path.startsWith(path));

      if (!shouldSkip) {
        // Monitor request body for threats (detection only)
        if (req.body) {
          this.threatDetector.detectThreats(req.body, "body", req);
        }

        // Monitor query parameters for threats
        if (req.query) {
          this.threatDetector.detectThreats(req.query, "query", req);
        }

        // Monitor URL parameters for threats
        if (req.params) {
          this.threatDetector.detectThreats(req.params, "params", req);
        }

        // Check for suspicious patterns in headers
        this.requestValidators.validateHeaders(req);

        // Validate Content-Type
        this.requestValidators.validateContentType(req);
      }

      next();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.logError("Security monitoring error:", error);
      // Continue processing even if monitoring fails
      next();
    }
  }

  /**
   * Get security monitoring statistics
   */
  getStats(): {
    threatsDetected: number;
    requestsMonitored: number;
  } {
    // In a real implementation, you might track these in Redis or memory
    return {
      threatsDetected: 0,
      requestsMonitored: 0,
    };
  }
}
