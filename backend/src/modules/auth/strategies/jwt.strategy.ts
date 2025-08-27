import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../../database/entities/user.entity';
import { JwtPayload, AuthenticatedUser } from '../interfaces/jwt-payload.interface';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

/**
 * JWT Strategy for passport authentication
 * Validates JWT tokens and extracts user information
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'your-super-secret-jwt-key'),
      algorithms: ['HS256'],
      audience: configService.get<string>('JWT_AUDIENCE', 'erp-app'),
      issuer: configService.get<string>('JWT_ISSUER', 'erp-backend'),
    });
  }

  /**
   * Validate JWT payload and return authenticated user
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.cacheManager.get(`blacklist:${payload.sessionId}`);
      if (isBlacklisted) {
        this.logger.warn(`Blacklisted token attempted access: ${payload.sessionId}`);
        throw new UnauthorizedException('Token has been revoked');
      }

      // Get user from database with fresh data
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        select: ['id', 'username', 'email', 'role', 'status', 'isActive', 'lastLoginAt'],
      });

      if (!user) {
        this.logger.warn(`User not found for JWT payload: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }

      // Check if user account is active
      if (!user.isActive || user.status !== UserStatus.ACTIVE) {
        this.logger.warn(`Inactive user attempted access: ${user.username}`);
        throw new UnauthorizedException('Account is inactive or suspended');
      }

      // Check if user is locked
      if (user.isLocked) {
        this.logger.warn(`Locked user attempted access: ${user.username}`);
        throw new UnauthorizedException('Account is temporarily locked');
      }

      // Verify session is still valid
      const sessionKey = `session:${payload.sessionId}`;
      const sessionData = await this.cacheManager.get(sessionKey);
      if (!sessionData) {
        this.logger.warn(`Invalid session attempted access: ${payload.sessionId}`);
        throw new UnauthorizedException('Session expired or invalid');
      }

      // Update last activity timestamp in cache
      await this.cacheManager.set(
        `activity:${user.id}`,
        new Date().toISOString(),
        300000 // 5 minutes TTL
      );

      // Log successful authentication for audit
      this.logger.log(`User authenticated successfully: ${user.username}`);

      return {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sessionId: payload.sessionId,
      };
    } catch (error) {
      this.logger.error(`JWT validation failed: ${error.message}`, error.stack);
      throw new UnauthorizedException('Invalid token');
    }
  }
}