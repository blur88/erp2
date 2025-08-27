import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

/**
 * JWT Authentication Guard
 * Extends PassportJS AuthGuard to provide JWT token validation
 * Supports optional authentication through IS_PUBLIC_KEY metadata
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Check if route requires authentication
   */
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Check if route allows optional authentication
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>('isOptionalAuth', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isOptionalAuth) {
      // Try to authenticate, but don't fail if no token provided
      return this.handleOptionalAuth(context);
    }

    return super.canActivate(context);
  }

  /**
   * Handle authentication errors
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    if (err || !user) {
      const errorMessage = err?.message || info?.message || 'Unauthorized access';
      
      this.logger.warn(`Authentication failed for ${request.method} ${request.url}: ${errorMessage}`);
      
      // Provide specific error messages for better UX
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired. Please login again.');
      }
      
      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token format.');
      }
      
      if (info?.name === 'NotBeforeError') {
        throw new UnauthorizedException('Token is not active yet.');
      }

      throw new UnauthorizedException(errorMessage);
    }

    // Attach user to request for downstream use
    request.user = user;
    
    this.logger.debug(`User authenticated: ${user.username} (${user.role})`);
    return user;
  }

  /**
   * Handle optional authentication
   */
  private async handleOptionalAuth(context: ExecutionContext): Promise<boolean> {
    try {
      const result = await super.canActivate(context);
      return !!result;
    } catch (error) {
      // For optional auth, we don't throw errors, just return false
      return true; // Allow access even without valid token
    }
  }
}