import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Local Authentication Guard
 * Uses passport local strategy for username/password authentication
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  private readonly logger = new Logger(LocalAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { username, password } = request.body;

    this.logger.debug(`Local auth attempt for: ${username}`);

    // Call the parent canActivate method
    const result = await super.canActivate(context);
    
    // Log the authentication result
    if (result) {
      this.logger.log(`Local authentication successful for: ${username}`);
    } else {
      this.logger.warn(`Local authentication failed for: ${username}`);
    }

    return result as boolean;
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    if (err || !user) {
      const { username } = request.body;
      this.logger.warn(`Local auth failed for ${username}: ${err?.message || info?.message || 'Unknown error'}`);
    }

    return super.handleRequest(err, user, info, context);
  }
}