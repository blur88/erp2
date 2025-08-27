import { Injectable } from '@nestjs/common';

export interface PasswordStrengthResult {
  isValid: boolean;
  score: number; // 0-4 (0 = very weak, 4 = very strong)
  errors: string[];
  suggestions: string[];
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxRepeatingChars: number;
  forbiddenPatterns: string[];
  minUniqueChars: number;
}

/**
 * Password Validation Service
 * Implements comprehensive password strength validation and security policies
 */
@Injectable()
export class PasswordValidationService {
  private readonly defaultPolicy: PasswordPolicy = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxRepeatingChars: 2,
    forbiddenPatterns: [
      'password',
      '123456',
      'qwerty',
      'admin',
      'user',
      'login',
      'welcome',
      'changeme',
    ],
    minUniqueChars: 6,
  };

  private readonly commonPasswords = new Set([
    'password',
    '123456789',
    '12345678',
    '123456',
    'qwerty',
    'abc123',
    'password123',
    'admin',
    'letmein',
    'welcome',
    'monkey',
    '1234567890',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
    'password1',
    'admin123',
    'root',
    'toor',
    'pass',
    '12345',
    '1234',
    '123',
    '111111',
    '000000',
  ]);

  /**
   * Validate password strength against policy
   */
  validatePassword(password: string, policy?: Partial<PasswordPolicy>): PasswordStrengthResult {
    const effectivePolicy = { ...this.defaultPolicy, ...policy };
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    // Basic length check
    if (password.length < effectivePolicy.minLength) {
      errors.push(`Password must be at least ${effectivePolicy.minLength} characters long`);
    } else {
      score += 1;
    }

    // Character variety checks
    if (effectivePolicy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
      suggestions.push('Add uppercase letters (A-Z)');
    } else if (effectivePolicy.requireUppercase) {
      score += 1;
    }

    if (effectivePolicy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
      suggestions.push('Add lowercase letters (a-z)');
    } else if (effectivePolicy.requireLowercase) {
      score += 1;
    }

    if (effectivePolicy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
      suggestions.push('Add numbers (0-9)');
    } else if (effectivePolicy.requireNumbers) {
      score += 1;
    }

    if (effectivePolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
      suggestions.push('Add special characters (!@#$%^&*()_+)');
    } else if (effectivePolicy.requireSpecialChars) {
      score += 1;
    }

    // Check for repeating characters
    const repeatingChars = this.findRepeatingCharacters(password);
    if (repeatingChars.length > effectivePolicy.maxRepeatingChars) {
      errors.push(`Password cannot have more than ${effectivePolicy.maxRepeatingChars} repeating characters in sequence`);
      suggestions.push('Avoid repeating the same character multiple times');
    }

    // Check unique characters
    const uniqueChars = new Set(password.toLowerCase()).size;
    if (uniqueChars < effectivePolicy.minUniqueChars) {
      errors.push(`Password must contain at least ${effectivePolicy.minUniqueChars} unique characters`);
      suggestions.push('Use more varied characters');
    }

    // Check for forbidden patterns
    const lowerPassword = password.toLowerCase();
    for (const pattern of effectivePolicy.forbiddenPatterns) {
      if (lowerPassword.includes(pattern.toLowerCase())) {
        errors.push(`Password cannot contain common words like "${pattern}"`);
        suggestions.push('Avoid using common words or phrases');
        break;
      }
    }

    // Check against common passwords
    if (this.commonPasswords.has(lowerPassword)) {
      errors.push('This password is too common and easily guessed');
      suggestions.push('Use a more unique password');
    }

    // Check for keyboard patterns
    if (this.hasKeyboardPattern(password)) {
      errors.push('Password contains keyboard patterns that are easy to guess');
      suggestions.push('Avoid keyboard patterns like "qwerty" or "123456"');
    }

    // Check for personal information patterns (basic)
    if (this.hasPersonalInfoPattern(password)) {
      errors.push('Password appears to contain personal information');
      suggestions.push('Avoid using personal information in passwords');
    }

    // Additional scoring for length
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;

    // Bonus for character variety
    const charTypes = this.getCharacterTypes(password);
    if (charTypes >= 4) score += 1;

    // Cap the score
    score = Math.min(score, 4);

    const isValid = errors.length === 0;

    return {
      isValid,
      score,
      errors,
      suggestions,
    };
  }

  /**
   * Get password strength label based on score
   */
  getStrengthLabel(score: number): string {
    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    return labels[Math.max(0, Math.min(score, 4))];
  }

  /**
   * Check if password has been compromised (simplified version)
   * In production, this would check against known breach databases
   */
  async isPasswordCompromised(password: string): Promise<boolean> {
    // This is a simplified implementation
    // In production, you would check against APIs like HaveIBeenPwned
    const lowerPassword = password.toLowerCase();
    return this.commonPasswords.has(lowerPassword);
  }

  /**
   * Generate password strength recommendations
   */
  generateRecommendations(password: string): string[] {
    const recommendations: string[] = [];
    
    if (password.length < 12) {
      recommendations.push('Use at least 12 characters for better security');
    }

    if (!/[A-Z]/.test(password)) {
      recommendations.push('Include uppercase letters');
    }

    if (!/[a-z]/.test(password)) {
      recommendations.push('Include lowercase letters');
    }

    if (!/\d/.test(password)) {
      recommendations.push('Include numbers');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      recommendations.push('Include special characters');
    }

    recommendations.push('Consider using a passphrase with multiple unrelated words');
    recommendations.push('Use a password manager to generate and store strong passwords');

    return recommendations;
  }

  /**
   * Find repeating character sequences
   */
  private findRepeatingCharacters(password: string): string {
    let maxRepeating = '';
    let current = '';
    
    for (let i = 0; i < password.length; i++) {
      if (i > 0 && password[i] === password[i - 1]) {
        current += password[i];
      } else {
        if (current.length > maxRepeating.length) {
          maxRepeating = current;
        }
        current = password[i];
      }
    }
    
    if (current.length > maxRepeating.length) {
      maxRepeating = current;
    }
    
    return maxRepeating;
  }

  /**
   * Check for keyboard patterns
   */
  private hasKeyboardPattern(password: string): boolean {
    const keyboardRows = [
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
      '1234567890',
    ];

    const lowerPassword = password.toLowerCase();
    
    for (const row of keyboardRows) {
      // Check for consecutive characters (3 or more)
      for (let i = 0; i <= row.length - 3; i++) {
        const pattern = row.substring(i, i + 3);
        const reversePattern = pattern.split('').reverse().join('');
        
        if (lowerPassword.includes(pattern) || lowerPassword.includes(reversePattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check for basic personal information patterns
   */
  private hasPersonalInfoPattern(password: string): boolean {
    const lowerPassword = password.toLowerCase();
    
    // Check for dates (basic patterns)
    if (/19\d{2}|20\d{2}/.test(password)) return true;
    if (/\d{2}\/\d{2}\/\d{2,4}/.test(password)) return true;
    if (/\d{1,2}-\d{1,2}-\d{2,4}/.test(password)) return true;
    
    // Check for phone number patterns
    if (/\d{3}-?\d{3}-?\d{4}/.test(password)) return true;
    
    return false;
  }

  /**
   * Get number of different character types used
   */
  private getCharacterTypes(password: string): number {
    let types = 0;
    
    if (/[a-z]/.test(password)) types++;
    if (/[A-Z]/.test(password)) types++;
    if (/\d/.test(password)) types++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) types++;
    
    return types;
  }
}