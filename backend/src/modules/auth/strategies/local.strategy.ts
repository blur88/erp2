import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { User } from '../../../database/entities/user.entity';

/**
 * Local Strategy for username/password authentication
 * Used for login endpoint validation
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(LocalStrategy.name);

  constructor(private authService: AuthService) {
    super({
      usernameField: 'username', // Accept both username and email in 'username' field
      passwordField: 'password',
    });
  }

  /**
   * Validate user credentials
   */
  async validate(username: string, password: string): Promise<User> {
    try {
      const user = await this.authService.validateUser(username, password);
      
      if (!user) {
        this.logger.warn(`Failed login attempt for: ${username}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      this.logger.log(`User validated successfully: ${user.username}`);
      return user;
    } catch (error) {
      this.logger.error(`Local strategy validation failed: ${error.message}`, error.stack);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}