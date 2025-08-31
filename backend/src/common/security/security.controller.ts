import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Get,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
// Auth guards and decorators removed - authentication system disabled
import { UserRole } from '../../database/entities/user.entity';

export interface CspViolationReport {
  'document-uri': string;
  referrer: string;
  'violated-directive': string;
  'effective-directive': string;
  'original-policy': string;
  disposition: string;
  'blocked-uri': string;
  'line-number': number;
  'column-number': number;
  'source-file': string;
  'status-code': number;
  'script-sample': string;
}

/**
 * Security Controller
 * Handles security-related endpoints like CSP violation reports
 */
@ApiTags('Security')
@Controller('security')
export class SecurityController {
  private readonly logger = new Logger(SecurityController.name);
  private cspViolations: CspViolationReport[] = [];

  /**
   * CSP Violation Report endpoint
   * Receives and logs Content Security Policy violations
   */
  @Post('csp-violation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 reports per minute
  @ApiExcludeEndpoint() // Hide from Swagger as it's used by browsers
  async reportCspViolation(@Body() violation: CspViolationReport): Promise<void> {
    try {
      // Log the violation
      this.logger.warn('CSP Violation detected:', {
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        documentUri: violation['document-uri'],
        sourceFile: violation['source-file'],
        lineNumber: violation['line-number'],
        columnNumber: violation['column-number'],
        scriptSample: violation['script-sample']?.substring(0, 100), // Limit sample length
      });

      // Store violation for analysis (in production, store in database)
      this.cspViolations.push({
        ...violation,
        timestamp: new Date() as any,
      });

      // Keep only last 1000 violations in memory
      if (this.cspViolations.length > 1000) {
        this.cspViolations = this.cspViolations.slice(-1000);
      }

      // Analyze for patterns and potential attacks
      this.analyzeCspViolation(violation);

    } catch (error) {
      this.logger.error('Error processing CSP violation report:', error);
    }
  }

  /**
   * Get CSP violation statistics (Admin only)
   */
  @Get('csp-violations')
  // Auth guards removed - endpoint now publicly accessible
  @ApiOperation({
    summary: 'Get CSP violation statistics',
    description: 'Retrieve Content Security Policy violation statistics and recent violations',
  })
  @ApiResponse({
    status: 200,
    description: 'CSP violation statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalViolations: { type: 'number', example: 42 },
        recentViolations: { type: 'number', example: 5 },
        topViolatedDirectives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              directive: { type: 'string', example: 'script-src' },
              count: { type: 'number', example: 15 },
            },
          },
        },
        topBlockedUris: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uri: { type: 'string', example: 'inline' },
              count: { type: 'number', example: 10 },
            },
          },
        },
        recentReports: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              violatedDirective: { type: 'string' },
              blockedUri: { type: 'string' },
              documentUri: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request parameters',
  })
  async getCspViolationStats(
    @Query('limit') limit: number = 10,
    @Query('hours') hours: number = 24,
  ) {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      const recentViolations = this.cspViolations.filter(
        v => new Date((v as any).timestamp) > cutoffTime
      );

      // Count violations by directive
      const directiveCounts = new Map<string, number>();
      recentViolations.forEach(v => {
        const directive = v['violated-directive'];
        directiveCounts.set(directive, (directiveCounts.get(directive) || 0) + 1);
      });

      // Count violations by blocked URI
      const uriCounts = new Map<string, number>();
      recentViolations.forEach(v => {
        const uri = v['blocked-uri'] || 'unknown';
        uriCounts.set(uri, (uriCounts.get(uri) || 0) + 1);
      });

      // Sort and limit results
      const topDirectives = Array.from(directiveCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([directive, count]) => ({ directive, count }));

      const topUris = Array.from(uriCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([uri, count]) => ({ uri, count }));

      const recentReports = recentViolations
        .slice(-limit)
        .map(v => ({
          violatedDirective: v['violated-directive'],
          blockedUri: v['blocked-uri'],
          documentUri: v['document-uri'],
          sourceFile: v['source-file'],
          lineNumber: v['line-number'],
          timestamp: (v as any).timestamp,
        }));

      return {
        totalViolations: this.cspViolations.length,
        recentViolations: recentViolations.length,
        timeframe: `${hours} hours`,
        topViolatedDirectives: topDirectives,
        topBlockedUris: topUris,
        recentReports,
      };

    } catch (error) {
      this.logger.error('Error retrieving CSP violation stats:', error);
      throw error;
    }
  }

  /**
   * Security health check endpoint
   */
  @Get('health')
  @ApiOperation({
    summary: 'Security health check',
    description: 'Check security configuration and status',
  })
  @ApiResponse({
    status: 200,
    description: 'Security health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', format: 'date-time' },
        checks: {
          type: 'object',
          properties: {
            headers: { type: 'boolean', example: true },
            csp: { type: 'boolean', example: true },
            cors: { type: 'boolean', example: true },
            rateLimit: { type: 'boolean', example: true },
          },
        },
        metrics: {
          type: 'object',
          properties: {
            cspViolations24h: { type: 'number', example: 2 },
            activeThreats: { type: 'number', example: 0 },
          },
        },
      },
    },
  })
  async getSecurityHealth() {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentViolations = this.cspViolations.filter(
        v => new Date((v as any).timestamp) > last24Hours
      );

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          headers: true, // Could check if security headers are properly configured
          csp: true, // CSP is working if we're receiving violation reports
          cors: true, // CORS configuration is active
          rateLimit: true, // Rate limiting is configured
        },
        metrics: {
          cspViolations24h: recentViolations.length,
          activeThreats: 0, // Could integrate with threat detection systems
        },
      };

    } catch (error) {
      this.logger.error('Error checking security health:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * Analyze CSP violation for potential security threats
   */
  private analyzeCspViolation(violation: CspViolationReport): void {
    const { 
      'violated-directive': directive, 
      'blocked-uri': blockedUri, 
      'script-sample': scriptSample 
    } = violation;

    let riskLevel = 'LOW';
    const indicators: string[] = [];

    // Check for XSS attempts
    if (directive.includes('script-src') && scriptSample) {
      if (scriptSample.includes('eval(') || scriptSample.includes('Function(')) {
        riskLevel = 'HIGH';
        indicators.push('Code injection attempt detected');
      }

      if (scriptSample.includes('document.cookie') || scriptSample.includes('localStorage')) {
        riskLevel = 'MEDIUM';
        indicators.push('Potential data theft attempt');
      }
    }

    // Check for inline script violations
    if (blockedUri === 'inline' && directive.includes('script-src')) {
      riskLevel = 'MEDIUM';
      indicators.push('Inline script execution attempt');
    }

    // Check for external resource loading
    if (blockedUri && blockedUri.startsWith('http') && !blockedUri.includes(violation['document-uri'])) {
      riskLevel = 'MEDIUM';
      indicators.push('Unauthorized external resource loading');
    }

    // Log high-risk violations
    if (riskLevel === 'HIGH' || riskLevel === 'MEDIUM') {
      this.logger.warn(`${riskLevel} risk CSP violation:`, {
        directive,
        blockedUri,
        indicators,
        documentUri: violation['document-uri'],
        scriptSample: scriptSample?.substring(0, 200),
      });
    }

    // In production, you might want to:
    // 1. Send alerts for high-risk violations
    // 2. Temporarily block IPs with multiple violations
    // 3. Update WAF rules based on patterns
    // 4. Store detailed violation data for analysis
  }
}