import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AuditService, AuditEventType, AuditSeverity, AuditContext } from './audit.service';
import { EmailService } from './email.service';

export interface SecurityThreat {
  threatType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  riskScore: number;
  indicators: string[];
  recommendedActions: string[];
  context: AuditContext;
}

export interface LoginAnalysis {
  isAnomalous: boolean;
  riskScore: number;
  flags: string[];
  recommendations: string[];
}

/**
 * Security Monitoring Service
 * Provides real-time security monitoring, threat detection, and automated response
 */
@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private readonly maxLoginAttemptsPerMinute = 5;
  private readonly maxLoginAttemptsPerHour = 20;
  private readonly suspiciousCountryCodes = new Set(['CN', 'RU', 'KP', 'IR']);
  private readonly knownBotUserAgents = [
    'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
  ];

  constructor(
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private configService: ConfigService,
    private auditService: AuditService,
    private emailService: EmailService,
  ) {}

  /**
   * Analyze login attempt for security threats
   */
  async analyzeLoginAttempt(
    context: AuditContext,
    isSuccess: boolean,
  ): Promise<LoginAnalysis> {
    const analysis: LoginAnalysis = {
      isAnomalous: false,
      riskScore: 0,
      flags: [],
      recommendations: [],
    };

    try {
      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(context);
      if (rateLimitCheck.exceeded) {
        analysis.riskScore += 3;
        analysis.flags.push('RATE_LIMIT_EXCEEDED');
        analysis.isAnomalous = true;
      }

      // Check for brute force patterns
      const bruteForceCheck = await this.checkBruteForcePattern(context);
      if (bruteForceCheck.detected) {
        analysis.riskScore += 4;
        analysis.flags.push('BRUTE_FORCE_DETECTED');
        analysis.isAnomalous = true;
      }

      // Check geographic anomalies
      const geoCheck = await this.checkGeographicAnomaly(context);
      if (geoCheck.isAnomalous) {
        analysis.riskScore += geoCheck.riskIncrease;
        analysis.flags.push('GEOGRAPHIC_ANOMALY');
        analysis.isAnomalous = true;
      }

      // Check user agent patterns
      const userAgentCheck = this.checkUserAgentAnomalies(context);
      if (userAgentCheck.isSuspicious) {
        analysis.riskScore += 2;
        analysis.flags.push('SUSPICIOUS_USER_AGENT');
        analysis.isAnomalous = true;
      }

      // Check time-based patterns
      const timeCheck = this.checkTimeBasedAnomalies(context);
      if (timeCheck.isAnomalous) {
        analysis.riskScore += 1;
        analysis.flags.push('UNUSUAL_TIME_PATTERN');
      }

      // Generate recommendations
      analysis.recommendations = this.generateSecurityRecommendations(analysis.flags);

      // Log if anomalous
      if (analysis.isAnomalous) {
        await this.auditService.logSuspiciousActivity(
          `Anomalous login pattern detected: ${analysis.flags.join(', ')}`,
          context,
          analysis.riskScore,
        );
      }

      return analysis;

    } catch (error) {
      this.logger.error('Error analyzing login attempt:', error);
      return analysis;
    }
  }

  /**
   * Detect and respond to security threats
   */
  async detectAndRespondToThreats(context: AuditContext): Promise<SecurityThreat[]> {
    const threats: SecurityThreat[] = [];

    try {
      // Check for account enumeration
      const enumerationThreat = await this.detectAccountEnumeration(context);
      if (enumerationThreat) {
        threats.push(enumerationThreat);
      }

      // Check for credential stuffing
      const credentialStuffingThreat = await this.detectCredentialStuffing(context);
      if (credentialStuffingThreat) {
        threats.push(credentialStuffingThreat);
      }

      // Check for session hijacking attempts
      const sessionThreat = await this.detectSessionThreats(context);
      if (sessionThreat) {
        threats.push(sessionThreat);
      }

      // Check for privilege escalation attempts
      const privilegeThreat = await this.detectPrivilegeEscalation(context);
      if (privilegeThreat) {
        threats.push(privilegeThreat);
      }

      // Respond to critical threats
      for (const threat of threats) {
        if (threat.severity === 'CRITICAL' || threat.severity === 'HIGH') {
          await this.respondToThreat(threat);
        }
      }

      return threats;

    } catch (error) {
      this.logger.error('Error detecting security threats:', error);
      return threats;
    }
  }

  /**
   * Check rate limiting for IP/user
   */
  private async checkRateLimit(context: AuditContext): Promise<{ exceeded: boolean; count: number }> {
    const ipKey = `rate_limit:${context.ipAddress}`;
    const userKey = `rate_limit:user:${context.userId || context.username}`;

    const ipCount = await this.incrementAndGetCount(ipKey, 60); // 1 minute window
    const userCount = await this.incrementAndGetCount(userKey, 3600); // 1 hour window

    const exceeded = ipCount > this.maxLoginAttemptsPerMinute || userCount > this.maxLoginAttemptsPerHour;

    if (exceeded) {
      await this.auditService.logRateLimitExceeded(
        context,
        'login',
        ipCount > this.maxLoginAttemptsPerMinute ? 'IP_RATE_LIMIT' : 'USER_RATE_LIMIT',
      );
    }

    return { exceeded, count: Math.max(ipCount, userCount) };
  }

  /**
   * Detect brute force attack patterns
   */
  private async checkBruteForcePattern(context: AuditContext): Promise<{ detected: boolean; pattern: string }> {
    const key = `brute_force:${context.ipAddress}`;
    const attempts = await this.cacheManager.get<number[]>(key) || [];
    
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    // Filter attempts from last 5 minutes
    const recentAttempts = attempts.filter(time => time > fiveMinutesAgo);
    recentAttempts.push(now);
    
    // Store updated attempts
    await this.cacheManager.set(key, recentAttempts, 300); // 5 minutes TTL

    const detected = recentAttempts.length >= 10; // 10 attempts in 5 minutes

    return {
      detected,
      pattern: detected ? 'RAPID_FAILED_ATTEMPTS' : '',
    };
  }

  /**
   * Check for geographic anomalies
   */
  private async checkGeographicAnomaly(context: AuditContext): Promise<{ isAnomalous: boolean; riskIncrease: number }> {
    // Simplified implementation - in production, use IP geolocation service
    const ipCountry = await this.getCountryFromIP(context.ipAddress);
    
    let riskIncrease = 0;
    let isAnomalous = false;

    // Check if from suspicious country
    if (this.suspiciousCountryCodes.has(ipCountry)) {
      riskIncrease += 2;
      isAnomalous = true;
    }

    // Check for impossible travel (simplified)
    if (context.userId) {
      const lastLocationKey = `last_location:${context.userId}`;
      const lastLocation = await this.cacheManager.get(lastLocationKey);
      
      if (lastLocation && lastLocation !== ipCountry) {
        // In production, calculate distance and time to detect impossible travel
        riskIncrease += 1;
        isAnomalous = true;
      }

      // Store current location
      await this.cacheManager.set(lastLocationKey, ipCountry, 86400); // 24 hours
    }

    return { isAnomalous, riskIncrease };
  }

  /**
   * Check user agent for suspicious patterns
   */
  private checkUserAgentAnomalies(context: AuditContext): { isSuspicious: boolean; reasons: string[] } {
    const userAgent = (context.userAgent || '').toLowerCase();
    const reasons: string[] = [];

    // Check for bot-like user agents
    for (const botPattern of this.knownBotUserAgents) {
      if (userAgent.includes(botPattern)) {
        reasons.push('BOT_USER_AGENT');
        break;
      }
    }

    // Check for missing or suspicious user agent
    if (!context.userAgent || context.userAgent.length < 10) {
      reasons.push('MISSING_OR_SHORT_USER_AGENT');
    }

    // Check for outdated or rare browsers
    if (userAgent.includes('msie') || userAgent.includes('internet explorer')) {
      reasons.push('OUTDATED_BROWSER');
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons,
    };
  }

  /**
   * Check for time-based anomalies
   */
  private checkTimeBasedAnomalies(context: AuditContext): { isAnomalous: boolean; reason: string } {
    const now = new Date();
    const hour = now.getHours();
    
    // Flag logins during unusual hours (2 AM - 5 AM)
    const isUnusualHour = hour >= 2 && hour <= 5;
    
    return {
      isAnomalous: isUnusualHour,
      reason: isUnusualHour ? 'UNUSUAL_HOUR_LOGIN' : '',
    };
  }

  /**
   * Detect account enumeration attempts
   */
  private async detectAccountEnumeration(context: AuditContext): Promise<SecurityThreat | null> {
    const key = `enum_attempts:${context.ipAddress}`;
    const attempts = await this.cacheManager.get<string[]>(key) || [];
    
    // Track different usernames tried from same IP
    const username = context.username || context.email || 'unknown';
    if (!attempts.includes(username)) {
      attempts.push(username);
      await this.cacheManager.set(key, attempts, 3600); // 1 hour
    }

    // If many different usernames tried, it's likely enumeration
    if (attempts.length >= 20) {
      return {
        threatType: 'ACCOUNT_ENUMERATION',
        severity: 'HIGH',
        description: 'Multiple username enumeration attempts detected',
        riskScore: 7,
        indicators: [
          `${attempts.length} different usernames tried from IP ${context.ipAddress}`,
          'Pattern consistent with automated account enumeration',
        ],
        recommendedActions: [
          'Block IP address temporarily',
          'Implement CAPTCHA for login attempts',
          'Monitor for continued enumeration attempts',
        ],
        context,
      };
    }

    return null;
  }

  /**
   * Detect credential stuffing attacks
   */
  private async detectCredentialStuffing(context: AuditContext): Promise<SecurityThreat | null> {
    const key = `credential_stuffing:${context.ipAddress}`;
    const attempts = await this.incrementAndGetCount(key, 3600); // 1 hour window

    if (attempts >= 50) {
      return {
        threatType: 'CREDENTIAL_STUFFING',
        severity: 'CRITICAL',
        description: 'Credential stuffing attack detected',
        riskScore: 9,
        indicators: [
          `${attempts} login attempts from single IP in last hour`,
          'Pattern consistent with automated credential testing',
        ],
        recommendedActions: [
          'Immediately block IP address',
          'Force password reset for affected accounts',
          'Implement account lockout policies',
          'Alert security team',
        ],
        context,
      };
    }

    return null;
  }

  /**
   * Detect session-related threats
   */
  private async detectSessionThreats(context: AuditContext): Promise<SecurityThreat | null> {
    // Check for session fixation or hijacking attempts
    // This is a simplified implementation
    
    if (context.sessionId) {
      const sessionKey = `session_check:${context.sessionId}`;
      const lastIP = await this.cacheManager.get(sessionKey);
      
      if (lastIP && lastIP !== context.ipAddress) {
        return {
          threatType: 'SESSION_HIJACKING',
          severity: 'HIGH',
          description: 'Potential session hijacking detected',
          riskScore: 8,
          indicators: [
            'Session accessed from different IP addresses',
            'Rapid IP address changes for same session',
          ],
          recommendedActions: [
            'Terminate the session immediately',
            'Force user re-authentication',
            'Alert user of suspicious activity',
            'Monitor user account closely',
          ],
          context,
        };
      }
      
      await this.cacheManager.set(sessionKey, context.ipAddress, 3600);
    }

    return null;
  }

  /**
   * Detect privilege escalation attempts
   */
  private async detectPrivilegeEscalation(context: AuditContext): Promise<SecurityThreat | null> {
    // Check for attempts to access resources beyond user's permissions
    // This would be called from authorization guards
    
    // Implementation would depend on how authorization failures are tracked
    // For now, return null - this would be implemented based on specific requirements
    return null;
  }

  /**
   * Respond to identified security threats
   */
  private async respondToThreat(threat: SecurityThreat): Promise<void> {
    try {
      // Log the threat
      await this.auditService.logSuspiciousActivity(
        threat.description,
        threat.context,
        threat.riskScore,
      );

      // Automatic responses based on threat type and severity
      switch (threat.threatType) {
        case 'CREDENTIAL_STUFFING':
        case 'ACCOUNT_ENUMERATION':
          await this.blockIPAddress(threat.context.ipAddress, '1 hour');
          break;
        
        case 'SESSION_HIJACKING':
          await this.terminateUserSessions(threat.context.userId);
          break;
      }

      // Send security alert email for critical threats
      if (threat.severity === 'CRITICAL') {
        const adminEmails = this.configService.get<string[]>('SECURITY_ADMIN_EMAILS', []);
        for (const email of adminEmails) {
          await this.emailService.sendSecurityAlertEmail(
            email,
            threat.threatType,
            `${threat.description}\n\nRisk Score: ${threat.riskScore}\n\nIndicators:\n${threat.indicators.join('\n')}`,
          );
        }
      }

    } catch (error) {
      this.logger.error('Error responding to security threat:', error);
    }
  }

  /**
   * Block IP address temporarily
   */
  private async blockIPAddress(ipAddress: string, duration: string): Promise<void> {
    const blockKey = `blocked_ip:${ipAddress}`;
    const durationMs = this.parseDuration(duration);
    
    await this.cacheManager.set(blockKey, true, durationMs);
    
    this.logger.warn(`IP address ${ipAddress} blocked for ${duration}`);
  }

  /**
   * Terminate all sessions for a user
   */
  private async terminateUserSessions(userId: string): Promise<void> {
    // This would terminate all active sessions for the user
    // Implementation depends on session storage structure
    this.logger.warn(`Terminating all sessions for user ${userId}`);
  }

  /**
   * Generate security recommendations based on flags
   */
  private generateSecurityRecommendations(flags: string[]): string[] {
    const recommendations = new Set<string>();

    if (flags.includes('RATE_LIMIT_EXCEEDED')) {
      recommendations.add('Implement CAPTCHA for repeated attempts');
      recommendations.add('Consider temporary account lockout');
    }

    if (flags.includes('BRUTE_FORCE_DETECTED')) {
      recommendations.add('Block IP address immediately');
      recommendations.add('Alert security team');
    }

    if (flags.includes('GEOGRAPHIC_ANOMALY')) {
      recommendations.add('Require additional verification');
      recommendations.add('Send security notification to user');
    }

    if (flags.includes('SUSPICIOUS_USER_AGENT')) {
      recommendations.add('Require CAPTCHA verification');
      recommendations.add('Monitor for bot-like behavior');
    }

    return Array.from(recommendations);
  }

  /**
   * Get country from IP address (simplified)
   */
  private async getCountryFromIP(ipAddress: string): Promise<string> {
    // In production, use a real IP geolocation service
    // For now, return a default country
    return 'US';
  }

  /**
   * Increment counter and get current count
   */
  private async incrementAndGetCount(key: string, ttl: number): Promise<number> {
    const current = await this.cacheManager.get<number>(key) || 0;
    const incremented = current + 1;
    await this.cacheManager.set(key, incremented, ttl);
    return incremented;
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/(\d+)\s*(minute|hour|day)s?/);
    if (!match) return 3600000; // Default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'minute': return value * 60 * 1000;
      case 'hour': return value * 60 * 60 * 1000;
      case 'day': return value * 24 * 60 * 60 * 1000;
      default: return 3600000;
    }
  }
}