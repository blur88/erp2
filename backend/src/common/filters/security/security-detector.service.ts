import { Injectable } from '@nestjs/common';
import { isSecurityError } from '../utils/error-classification.util';

/**
 * Service for detecting security-related errors and threats
 */
@Injectable()
export class SecurityDetectorService {
  /**
   * Detect if an error is security-related
   */
  isSecurityRelated(status: number, error: string): boolean {
    return isSecurityError(status, error);
  }

  /**
   * Analyze error message for security patterns
   */
  analyzeErrorMessage(message: string): {
    isSensitive: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    patterns: string[];
  } {
    const lowerMessage = message.toLowerCase();
    const detectedPatterns: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    // High-risk patterns
    const highRiskPatterns = ['password', 'secret', 'key', 'token', 'credential'];
    const mediumRiskPatterns = ['unauthorized', 'forbidden', 'authentication', 'authorization'];
    const lowRiskPatterns = ['jwt', 'session', 'login'];

    // Check for patterns
    highRiskPatterns.forEach(pattern => {
      if (lowerMessage.includes(pattern)) {
        detectedPatterns.push(pattern);
        riskLevel = 'HIGH';
      }
    });

    if (riskLevel === 'LOW') {
      mediumRiskPatterns.forEach(pattern => {
        if (lowerMessage.includes(pattern)) {
          detectedPatterns.push(pattern);
          riskLevel = 'MEDIUM';
        }
      });
    }

    if (riskLevel === 'LOW') {
      lowRiskPatterns.forEach(pattern => {
        if (lowerMessage.includes(pattern)) {
          detectedPatterns.push(pattern);
        }
      });
    }

    return {
      isSensitive: detectedPatterns.length > 0,
      riskLevel,
      patterns: detectedPatterns,
    };
  }
}