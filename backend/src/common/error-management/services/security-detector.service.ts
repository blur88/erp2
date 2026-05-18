import { Injectable } from '@nestjs/common';
import { isSecurityError } from '../utils/error-classification.util';

@Injectable()
export class SecurityDetectorService {
  isSecurityRelated(status: number, error: string): boolean {
    return isSecurityError(status, error);
  }

  analyzeErrorMessage(message: string): {
    isSensitive: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    patterns: string[];
  } {
    const lowerMessage = message.toLowerCase();
    const detectedPatterns: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    const highRiskPatterns = ['password', 'secret', 'key', 'token', 'credential'];
    const mediumRiskPatterns = ['unauthorized', 'forbidden', 'authentication', 'authorization'];
    const lowRiskPatterns = ['jwt', 'session', 'login'];

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

    return { isSensitive: detectedPatterns.length > 0, riskLevel, patterns: detectedPatterns };
  }
}
