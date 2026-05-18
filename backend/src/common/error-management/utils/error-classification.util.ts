import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryFailedError } from 'typeorm';

const SECURITY_STATUSES = new Set([
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.TOO_MANY_REQUESTS,
]);

const SECURITY_KEYWORDS = new Set([
  'unauthorized',
  'forbidden',
  'jwt',
  'token',
  'authentication',
  'authorization',
]);

export function isSecurityError(status: number, error: string): boolean {
  if (SECURITY_STATUSES.has(status)) {
    return true;
  }
  const lowerError = error.toLowerCase();
  return Array.from(SECURITY_KEYWORDS).some(keyword => lowerError.includes(keyword));
}

export function shouldLogBadRequest(exception: unknown): boolean {
  if (exception instanceof QueryFailedError) {
    return true;
  }
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const message = typeof response === 'object' ? JSON.stringify(response) : response;
    return isSecurityError(HttpStatus.BAD_REQUEST, message.toString());
  }
  return false;
}

export function generateSecureRequestId(): string {
  try {
    return randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
